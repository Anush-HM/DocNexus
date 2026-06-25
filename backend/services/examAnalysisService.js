// backend/services/examAnalysisService.js
// ─────────────────────────────────────────────
//  Previous-Year Question Paper Module
//  Exam Analysis: identifies most-asked topics by
//  matching QP chunks against the project's known
//  unified-note topics.
// ─────────────────────────────────────────────

const { getChatModel } = require('./llmService');

function stripCodeFences(text) {
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
}

/**
 * Given raw question-paper text chunks and the list of known topics
 * (from the unified notes), classify each QP chunk to the topic it's
 * testing, then aggregate frequency counts.
 *
 * @param {string[]} qpTexts - raw text chunks from question papers
 * @param {string[]} knownTopics - topic titles from UnifiedNote
 * @returns {Promise<Array<{ topic: string, count: number }>>}
 */
async function analyzeTopicFrequency(qpTexts, knownTopics) {
  const model = getChatModel({ temperature: 0 });

  const prompt = `You are analyzing previous-year exam question papers to find which topics are asked most frequently.

KNOWN TOPICS (from the student's study notes):
${knownTopics.map((t) => `- ${t}`).join('\n')}

QUESTION PAPER EXCERPTS (each is one question or question block):
${qpTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')}

For each excerpt, decide which KNOWN TOPIC (if any) it is testing. An excerpt may match zero or one topic — pick the closest match, or null if none fit well.

Respond ONLY with strict JSON, no markdown fences:
{ "matches": [ { "excerptIndex": number, "topic": "string or null" }, ... ] }`;

  const response = await model.invoke(prompt);
  const raw = typeof response.content === 'string' ? response.content : String(response.content);
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    parsed = { matches: [] };
  }

  const counts = {};
  (parsed.matches || []).forEach((m) => {
    if (!m.topic) return;
    counts[m.topic] = (counts[m.topic] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

module.exports = { analyzeTopicFrequency };