// backend/services/fusionEngine.js
// ─────────────────────────────────────────────
//  Phase 5: Knowledge Fusion Engine (Custom DocNexus Logic)
//  This is the core innovation of the project.
//
//  Pipeline:
//    Embeddings → Topic Matching → Duplicate Detection
//      → Conflict Detection → Knowledge Fusion
// ─────────────────────────────────────────────

const { cosineSimilarity } = require('./embeddingService');
const { getChatModel } = require('./llmService');

const TOPIC_MATCH_THRESHOLD = 0.80;   // chunks above this are "same topic"
const DUPLICATE_THRESHOLD = 0.93;     // chunks above this are near-identical → dedupe

/**
 * STEP 1 — Topic Matching
 * Groups chunks from possibly-different sources into topic clusters
 * based on embedding similarity. Greedy clustering: O(n^2) but fine
 * for a study-material-scale document set (hundreds of chunks).
 *
 * @param {Array<{_id, text, embedding, sourceFileName, pageNumber}>} chunks
 * @returns {Array<{ members: Array<chunk> }>} clusters
 */
function clusterByTopic(chunks) {
  const clusters = [];
  const assigned = new Array(chunks.length).fill(false);

  for (let i = 0; i < chunks.length; i++) {
    if (assigned[i]) continue;
    const cluster = { members: [chunks[i]] };
    assigned[i] = true;

    for (let j = i + 1; j < chunks.length; j++) {
      if (assigned[j]) continue;
      const sim = cosineSimilarity(chunks[i].embedding, chunks[j].embedding);
      if (sim >= TOPIC_MATCH_THRESHOLD) {
        cluster.members.push(chunks[j]);
        assigned[j] = true;
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

/**
 * STEP 2 — Duplicate Detection
 * Within a topic cluster, mark near-identical chunks (same explanation
 * repeated across sources) so the fusion prompt doesn't have to read
 * the same paragraph five times. Keeps the longest/most-detailed
 * version as the "best" representative of each duplicate group.
 *
 * @param {Array<chunk>} members - chunks belonging to one topic cluster
 * @returns {{ deduped: Array<chunk>, duplicatesRemoved: number }}
 */
function dedupeCluster(members) {
  const keep = [];
  const used = new Array(members.length).fill(false);
  let duplicatesRemoved = 0;

  for (let i = 0; i < members.length; i++) {
    if (used[i]) continue;
    const group = [members[i]];
    used[i] = true;

    for (let j = i + 1; j < members.length; j++) {
      if (used[j]) continue;
      const sim = cosineSimilarity(members[i].embedding, members[j].embedding);
      if (sim >= DUPLICATE_THRESHOLD) {
        group.push(members[j]);
        used[j] = true;
      }
    }

    // Keep the longest text in the group as the representative version
    const best = group.reduce((a, b) => (b.text.length > a.text.length ? b : a));
    keep.push(best);
    duplicatesRemoved += group.length - 1;
  }

  return { deduped: keep, duplicatesRemoved };
}

/**
 * STEP 3 + 4 — Conflict Detection & Knowledge Fusion (LLM-assisted)
 * For each topic cluster (after dedup), ask the LLM to:
 *   1. Give the cluster a clean topic title
 *   2. Write one unified, well-written explanation citing source files
 *   3. Flag if sources genuinely contradict each other (not just word
 *      differently) and if so, describe both claims + a recommendation
 *
 * Returns one fusion result object per cluster.
 */
async function fuseCluster(deduped) {
  const model = getChatModel();

  const sourceBlocks = deduped
    .map(
      (c, idx) =>
        `[Source ${idx + 1}: ${c.sourceFileName}${c.pageNumber ? `, page ${c.pageNumber}` : ''}]\n${c.text}`
    )
    .join('\n\n---\n\n');

  const prompt = `You are the Knowledge Fusion Engine of DocNexus, a study-notes consolidation tool.
You are given several excerpts from different study sources that all discuss the SAME topic.

Your job:
1. Pick a short, clean topic title (3-6 words, e.g. "Deadlock", "TCP Handshake").
2. Write ONE unified, well-organized explanation that merges all the correct information from these excerpts into clear prose (120-220 words). Do not just concatenate the excerpts — synthesize them.
3. Determine if the excerpts genuinely CONTRADICT each other on a factual point (e.g. different numeric values, different step counts, opposing claims). Minor differences in wording or detail level are NOT conflicts.

Respond ONLY with strict JSON in this exact shape, no markdown fences, no extra text:
{
  "title": "string",
  "content": "string",
  "hasConflict": boolean,
  "conflict": {
    "sourceAName": "string or null",
    "sourceAClaim": "string or null",
    "sourceBName": "string or null",
    "sourceBClaim": "string or null",
    "recommended": "string or null, which source/value is most likely correct and why"
  }
}
If hasConflict is false, set every field inside "conflict" to null.

EXCERPTS:
${sourceBlocks}`;

  const response = await model.invoke(prompt);
  const raw = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

  let parsed;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch (err) {
    // Fallback: if the model didn't return clean JSON, build a degraded
    // result so the pipeline doesn't crash on one bad cluster.
    parsed = {
      title: deduped[0].text.slice(0, 40).split('\n')[0],
      content: deduped.map((c) => c.text).join(' '),
      hasConflict: false,
      conflict: null,
    };
  }

  const sources = [...new Set(deduped.map((c) => c.sourceFileName))];

  return {
    title: parsed.title,
    content: parsed.content,
    sources,
    hasConflict: !!parsed.hasConflict,
    conflict: parsed.hasConflict
      ? {
          topic: parsed.title,
          sourceA: { name: parsed.conflict.sourceAName, claim: parsed.conflict.sourceAClaim },
          sourceB: { name: parsed.conflict.sourceBName, claim: parsed.conflict.sourceBClaim },
          recommended: parsed.conflict.recommended,
        }
      : null,
  };
}

function stripCodeFences(text) {
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
}

/**
 * Full fusion pipeline entry point.
 * @param {Array<chunk>} allChunks - all chunks (with embeddings) for a project
 * @returns {Promise<{ notes: Array, conflicts: Array, duplicatesRemoved: number, sourcesUsed: number }>}
 */
async function runFusion(allChunks) {
  const clusters = clusterByTopic(allChunks);

  let totalDuplicatesRemoved = 0;
  const notes = [];
  const conflicts = [];

  // Process clusters with limited concurrency to avoid hammering the OpenAI API
  const CONCURRENCY = 4;
  for (let i = 0; i < clusters.length; i += CONCURRENCY) {
    const batch = clusters.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (cluster) => {
        const { deduped, duplicatesRemoved } = dedupeCluster(cluster.members);
        totalDuplicatesRemoved += duplicatesRemoved;
        // Skip clusters too thin to be worth a "topic" (single short chunk, one source)
        if (deduped.length === 0) return null;
        const fused = await fuseCluster(deduped);
        return fused;
      })
    );

    batchResults.forEach((fused) => {
      if (!fused) return;
      notes.push(fused);
      if (fused.hasConflict) conflicts.push(fused.conflict);
    });
  }

  const sourcesUsed = new Set(allChunks.map((c) => c.sourceFileName)).size;

  return {
    notes,
    conflicts,
    duplicatesRemoved: totalDuplicatesRemoved,
    sourcesUsed,
  };
}

module.exports = { runFusion, clusterByTopic, dedupeCluster, fuseCluster };