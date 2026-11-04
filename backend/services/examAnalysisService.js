// backend/services/examAnalysisService.js
// ─────────────────────────────────────────────
//  Previous-Year Question Paper Module
//  Exam Analysis: identifies most-asked topics by
//  matching INDIVIDUAL QUESTIONS from the papers
//  against the project's known unified-note topics.
//
//  - Papers are split into questions (not overlapping
//    chunks), so nothing is counted twice.
//  - Questions go to the model in small batches, so a
//    big paper set can't overflow one prompt.
//  - A batch whose reply can't be parsed is retried;
//    if analysis still fails the error is thrown so the
//    project shows "failed" instead of a silent empty list.
// ─────────────────────────────────────────────

const { getChatModel } = require('./llmService');
const { throttle } = require('./rateLimiter');
const { embedBatch, cosineSimilarity } = require('./embeddingService');

const QUESTIONS_PER_BATCH = 30;
const MAX_QUESTION_CHARS = 350;
const MIN_QUESTION_CHARS = 15;
const BATCH_CONCURRENCY = 3;

function stripCodeFences(text) {
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
}

/**
 * Split one question paper's text into individual questions.
 * Looks for numbering like "1.", "Q1", "Q.2)", "(3)"; if the paper has no
 * recognisable numbering, falls back to sentence-aligned windows.
 */
function splitIntoQuestions(text) {
  const clean = (text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  if (!clean) return [];

  const marker = /(?:^|\n|\s)(?=(?:Q(?:uestion)?\.?\s*\d{1,2}\s*[.):\-]?\s|\(?\d{1,2}[.)]\s+[A-Z(]))/g;
  let parts = clean.split(marker).map((p) => p.trim());

  if (parts.filter((p) => p.length >= MIN_QUESTION_CHARS).length < 3) {
    // No usable numbering: cut on sentence ends into ~MAX_QUESTION_CHARS windows
    parts = [];
    const sentences = clean.split(/(?<=[.?!])\s+/);
    let cur = '';
    for (const s of sentences) {
      if ((cur + ' ' + s).length > MAX_QUESTION_CHARS && cur) {
        parts.push(cur.trim());
        cur = s;
      } else {
        cur = cur ? `${cur} ${s}` : s;
      }
    }
    if (cur.trim()) parts.push(cur.trim());
  }

  return parts
    .map((p) => p.replace(/\s+/g, ' ').slice(0, MAX_QUESTION_CHARS))
    .filter((p) => p.length >= MIN_QUESTION_CHARS);
}

function normalizeKey(q) {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function classifyBatch(questions, knownTopics) {
  const prompt = `You are analyzing previous-year exam question papers to find which topics are asked most frequently.

KNOWN TOPICS (from the student's study notes):
${knownTopics.map((t) => `- ${t}`).join('\n')}

QUESTIONS:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

For each question, decide which KNOWN TOPIC (if any) it is testing. Pick the closest match, copying the topic EXACTLY as written above, or null if none fit well.

Respond ONLY with strict JSON, no markdown fences:
{ "matches": [ { "questionIndex": number, "topic": "string or null" }, ... ] }`;

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await throttle();
      const response = await getChatModel({ temperature: 0 }).invoke(prompt);
      const raw = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const parsed = JSON.parse(stripCodeFences(raw));
      if (!Array.isArray(parsed.matches)) throw new Error('reply has no "matches" array');
      return parsed.matches;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Exam analysis could not read the model's reply (${lastErr.message}).`);
}

/**
 * @param {Array<{name: string, text: string}>} papers - full text of each question paper
 * @param {string[]} knownTopics - topic titles from UnifiedNote
 * @returns {Promise<Array<{ topic: string, count: number }>>}
 */
async function analyzeTopicFrequency(papers, knownTopics) {
  // 1) questions per paper, de-duplicated within a paper
  const questions = [];
  for (const paper of papers) {
    const seen = new Set();
    for (const q of splitIntoQuestions(paper.text)) {
      const key = normalizeKey(q);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      questions.push(q);
    }
  }
  if (questions.length === 0) return [];

  // 2) classify in small batches (a few in parallel; the rate limiter caps calls/min)
  const batches = [];
  for (let i = 0; i < questions.length; i += QUESTIONS_PER_BATCH) batches.push(questions.slice(i, i + QUESTIONS_PER_BATCH));

  const topicLookup = new Map(knownTopics.map((t) => [t.trim().toLowerCase(), t]));
  const counts = {};
  let next = 0;
  async function worker() {
    while (next < batches.length) {
      const idx = next++;
      const matches = await classifyBatch(batches[idx], knownTopics);
      const counted = new Set(); // each question counts once, even if the model repeats it
      for (const m of matches) {
        const qi = Number(m.questionIndex);
        if (!m.topic || !Number.isInteger(qi) || qi < 1 || qi > batches[idx].length || counted.has(qi)) continue;
        const canonical = topicLookup.get(String(m.topic).trim().toLowerCase());
        if (!canonical) continue; // ignore topics the model made up
        counted.add(qi);
        counts[canonical] = (counts[canonical] || 0) + 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, worker));

  return Object.entries(counts)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

// ─────────────────────────────────────────────
//  Embedding-based matching (primary): each question is matched to the closest
//  note topic by cosine similarity. No LLM JSON to parse, so it cannot fail on a
//  bad reply, costs a couple of embedding calls, and also records WHICH paper /
//  year asked each topic, so the chatbot can say "asked in 2023 and 2024".
// ─────────────────────────────────────────────
const MATCH_THRESHOLD = Number(process.env.EXAM_MATCH_THRESHOLD) || 0.42;
const GENERIC_TITLE = /review questions|topics? for discussion|summary|exercise|bibliograph|references|chapter outline|^introduction$|more figures|contains only an image/i;

function paperYear(paper) {
  const fromName = String(paper.name || '').match(/(?:19|20)\d{2}(?:[-_/ ](?:19|20)?\d{2})?/);
  if (fromName) return fromName[0].replace(/[_/ ]/g, '-');
  const fromText = String(paper.text || '').slice(0, 1500).match(/\b(?:19|20)\d{2}\b/);
  return fromText ? fromText[0] : null;
}

/**
 * @param {Array<{name:string,text:string}>} papers
 * @param {Array<{title:string,content?:string,embedding:number[]}>} notes - with embeddings
 * @returns {Promise<Array<{topic:string,count:number,papers:{name:string,year:string|null,count:number}[],questions:string[]}>>}
 */
async function analyzeByEmbedding(papers, notes) {
  const cands = notes.filter((n) => n.embedding && n.embedding.length && !GENERIC_TITLE.test(n.title) && !GENERIC_TITLE.test(String(n.content || '').slice(0, 80)));
  if (!cands.length) throw new Error('no note embeddings to match against');

  const qs = []; // { q, paper }
  for (const paper of papers) {
    const seen = new Set();
    const label = paperYear(paper) || paper.name;
    for (const q of splitIntoQuestions(paper.text)) {
      const key = normalizeKey(q);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      qs.push({ q, paper: paper.name, year: paperYear(paper), label });
    }
  }
  if (!qs.length) return [];

  const vecs = await embedBatch(qs.map((x) => x.q));
  const agg = new Map(); // title -> { count, papers: Map(name -> {name,year,count}), questions: [] }
  qs.forEach((x, i) => {
    let best = null;
    let bestSim = -1;
    for (const n of cands) {
      const sim = cosineSimilarity(vecs[i], n.embedding);
      if (sim > bestSim) { bestSim = sim; best = n; }
    }
    if (!best || bestSim < MATCH_THRESHOLD) return;
    const e = agg.get(best.title) || { count: 0, papers: new Map(), questions: [] };
    e.count++;
    const pp = e.papers.get(x.paper) || { name: x.paper, year: x.year, count: 0 };
    pp.count++;
    e.papers.set(x.paper, pp);
    if (e.questions.length < 3) e.questions.push(x.q.slice(0, 220));
    agg.set(best.title, e);
  });

  return [...agg.entries()]
    .map(([topic, e]) => ({ topic, count: e.count, papers: [...e.papers.values()], questions: e.questions }))
    .sort((a, b) => b.papers.length - a.papers.length || b.count - a.count);
}

/** Embedding match first; fall back to the LLM classifier if that cannot run. */
async function analyzeExam(papers, notes) {
  try {
    return await analyzeByEmbedding(papers, notes);
  } catch (err) {
    console.warn('[examAnalysis] embedding match unavailable, using LLM classifier:', err.message);
    const topics = await analyzeTopicFrequency(papers, [...new Set(notes.map((n) => n.title))]);
    return topics.map((t) => ({ ...t, papers: [], questions: [] }));
  }
}

module.exports = { analyzeTopicFrequency, analyzeExam, splitIntoQuestions };
