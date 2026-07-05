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
 * STEP 3 + 4 — Conflict Detection & Knowledge Fusion (LLM-assisted, BATCHED)
 * Instead of one LLM call per topic cluster (which can mean 15-20+ calls
 * for a typical upload — too many for a free-tier daily request cap),
 * this sends SEVERAL clusters in one prompt and asks for fused results
 * for all of them in one structured JSON response.
 *
 * For each cluster in the batch, asks the LLM to:
 *   1. Give the cluster a clean topic title
 *   2. Write one unified, well-written explanation citing source files
 *   3. Flag if sources genuinely contradict each other
 *
 * @param {Array<Array<chunk>>} dedupedClusters - each inner array is one
 *   cluster's deduped chunks
 * @returns {Promise<Array<fusedResult>>} one result per input cluster, in order
 */
async function fuseClusterBatch(dedupedClusters) {
  const model = getChatModel();

  const clusterBlocks = dedupedClusters
    .map((deduped, clusterIdx) => {
      const sourceBlocks = deduped
        .map(
          (c, idx) =>
            `  [Source ${idx + 1}: ${c.sourceFileName}${c.pageNumber ? `, page ${c.pageNumber}` : ''}]\n  ${c.text}`
        )
        .join('\n\n  ---\n\n');
      return `### TOPIC GROUP ${clusterIdx + 1}\n${sourceBlocks}`;
    })
    .join('\n\n========================================\n\n');

  const prompt = `You are the Knowledge Fusion Engine of DocNexus, a study-notes consolidation tool.
You are given ${dedupedClusters.length} separate TOPIC GROUPS. Each group contains several excerpts from different study sources that all discuss the SAME topic as each other (but different groups cover different topics).

For EACH topic group, independently:
1. Pick a short, clean topic title (3-6 words, e.g. "Deadlock", "TCP Handshake").
2. Write ONE unified, well-organized explanation that merges all the correct information from that group's excerpts into clear prose (120-220 words). Do not just concatenate the excerpts — synthesize them.
3. Determine if that group's excerpts genuinely CONTRADICT each other on a factual point (e.g. different numeric values, different step counts, opposing claims). Minor differences in wording or detail level are NOT conflicts.

Respond ONLY with strict JSON in this exact shape, no markdown fences, no extra text. The "results" array must have exactly ${dedupedClusters.length} entries, in the same order as the topic groups given:
{
  "results": [
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
  ]
}
If hasConflict is false for a group, set every field inside its "conflict" to null.

TOPIC GROUPS:
${clusterBlocks}`;

  const response = await model.invoke(prompt);
  const raw = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

  let parsedResults;
  try {
    const parsed = JSON.parse(stripCodeFences(raw));
    parsedResults = Array.isArray(parsed.results) ? parsed.results : [];
  } catch (err) {
    parsedResults = [];
  }

  return dedupedClusters.map((deduped, idx) => {
    const parsed = parsedResults[idx];
    const sources = [...new Set(deduped.map((c) => c.sourceFileName))];

    // Fallback for a missing/malformed entry in the batch response —
    // degrade gracefully for that one topic instead of losing the batch.
    if (!parsed) {
      return {
        title: deduped[0].text.slice(0, 40).split('\n')[0],
        content: deduped.map((c) => c.text).join(' '),
        sources,
        hasConflict: false,
        conflict: null,
      };
    }

    return {
      title: parsed.title,
      content: parsed.content,
      sources,
      hasConflict: !!parsed.hasConflict,
      conflict: parsed.hasConflict
        ? {
            topic: parsed.title,
            sourceA: { name: parsed.conflict?.sourceAName, claim: parsed.conflict?.sourceAClaim },
            sourceB: { name: parsed.conflict?.sourceBName, claim: parsed.conflict?.sourceBClaim },
            recommended: parsed.conflict?.recommended,
          }
        : null,
    };
  });
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

  // Dedupe every cluster first (cheap, no LLM calls), then batch the
  // LLM-requiring fusion step. Grouping several topics into ONE prompt
  // turns what used to be "1 call per topic" (often 15-20+ calls per
  // upload) into "1 call per ~6 topics" — comfortably inside a free-tier
  // daily request cap (e.g. Gemini's 20/day on some projects).
  const TOPICS_PER_BATCH = 6;
  const CALL_DELAY_MS = 4500; // still pace between batches to respect per-minute limits too

  const dedupedClusters = [];
  for (const cluster of clusters) {
    const { deduped, duplicatesRemoved } = dedupeCluster(cluster.members);
    totalDuplicatesRemoved += duplicatesRemoved;
    if (deduped.length > 0) dedupedClusters.push(deduped);
  }

  for (let i = 0; i < dedupedClusters.length; i += TOPICS_PER_BATCH) {
    const batch = dedupedClusters.slice(i, i + TOPICS_PER_BATCH);

    try {
      const fusedBatch = await fuseClusterBatch(batch);
      fusedBatch.forEach((fused) => {
        notes.push(fused);
        if (fused.hasConflict) conflicts.push(fused.conflict);
      });
    } catch (err) {
      // An entire batch failing after retries (e.g. sustained outage)
      // shouldn't take down the whole upload — log it and continue with
      // whatever other batches succeed, so the user still gets partial
      // results instead of nothing.
      console.error(`[fusionEngine] Batch starting at topic ${i} failed after retries, skipping:`, err.message);
    }

    if (i + TOPICS_PER_BATCH < dedupedClusters.length) {
      await new Promise((resolve) => setTimeout(resolve, CALL_DELAY_MS));
    }
  }

  const sourcesUsed = new Set(allChunks.map((c) => c.sourceFileName)).size;

  return {
    notes,
    conflicts,
    duplicatesRemoved: totalDuplicatesRemoved,
    sourcesUsed,
  };
}

module.exports = { runFusion, clusterByTopic, dedupeCluster, fuseClusterBatch };