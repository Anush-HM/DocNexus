// backend/services/studyMaterialService.js
// ─────────────────────────────────────────────
//  Generates flashcards, quizzes and revision sheets
//  from the fused Unified Notes of a project.
// ─────────────────────────────────────────────

const { getChatModel } = require('./llmService');

function stripCodeFences(text) {
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
}

async function callJSON(prompt) {
  const model = getChatModel({ temperature: 0.5 });
  const response = await model.invoke(prompt);
  const raw = typeof response.content === 'string' ? response.content : String(response.content);
  return JSON.parse(stripCodeFences(raw));
}

// Keep the prompt small (fast + inside the model's limits): an even spread of
// up to 30 text topics, each trimmed. Figure-only pages are skipped.
function pickNotes(notes, max = 30) {
  const text = notes.filter((n) => !/contains only an image/i.test(n.content || ''));
  if (text.length <= max) return text;
  const step = text.length / max;
  return Array.from({ length: max }, (_, i) => text[Math.floor(i * step)]);
}

function buildNotesContext(notes) {
  return pickNotes(notes)
    .map((n) => `### ${n.title}\n${String(n.content).replace(/^#+ /gm, '').slice(0, 450)}`)
    .join('\n\n');
}

/**
 * Generate flashcards (Q/A pairs) from unified notes.
 */
async function generateFlashcards(notes, count = 12) {
  const context = buildNotesContext(notes);
  const prompt = `From the study notes below, generate exactly ${count} flashcards for active recall revision.
Each flashcard should have a clear, specific question and a concise, accurate answer (1-3 sentences).
Cover a good spread of topics, not just the first one.

Respond ONLY with strict JSON, no markdown fences:
{ "flashcards": [ { "q": "string", "a": "string" }, ... ] }

NOTES:
${context}`;
  const parsed = await callJSON(prompt);
  return parsed.flashcards || [];
}

/**
 * Generate a quiz: MCQs, short-answer, and long-answer questions.
 */
async function generateQuiz(notes, mcqCount = 5, shortCount = 5, longCount = 3) {
  const context = buildNotesContext(notes);
  const prompt = `From the study notes below, generate a quiz with:
- ${mcqCount} multiple-choice questions, each with exactly 4 options and one correct answer (0-indexed).
- ${shortCount} short-answer questions (no options, just the question).
- ${longCount} long-answer / essay-style questions (no options, just the question).

Respond ONLY with strict JSON, no markdown fences:
{
  "mcq": [ { "q": "string", "options": ["string","string","string","string"], "answer": 0 }, ... ],
  "short": [ { "q": "string" }, ... ],
  "long": [ { "q": "string" }, ... ]
}

NOTES:
${context}`;
  const parsed = await callJSON(prompt);
  return {
    mcq: parsed.mcq || [],
    short: parsed.short || [],
    long: parsed.long || [],
  };
}

/**
 * Generate a unit-wise quick revision sheet.
 */
async function generateRevisionSheet(notes) {
  const context = buildNotesContext(notes);
  const prompt = `From the study notes below, group related topics into logical units (e.g. "Deadlock", "CPU Scheduling", "Memory Management") and produce a quick revision sheet: 4-6 short, high-density bullet points per unit covering the most exam-important facts.

Respond ONLY with strict JSON, no markdown fences:
{ "revision": [ { "unit": "string", "points": ["string", ...] }, ... ] }

NOTES:
${context}`;
  const parsed = await callJSON(prompt);
  return parsed.revision || [];
}

/**
 * Generate flashcards, quiz and revision sheet in ONE LLM call instead of 3
 * separate ones. This is the main entry point used right after fusion completes.
 * Falls back to two smaller calls (flashcards+quiz, then revision) if the
 * combined response is too long to parse (e.g. very large note sets).
 */
async function generateAllStudyMaterial(
  notes,
  { flashcardCount = 8, mcqCount = 4, shortCount = 3, longCount = 2 } = {}
) {
  const context = buildNotesContext(notes);

  const prompt = `From the study notes below, generate ALL THREE of the following study materials in one response:

1. FLASHCARDS: exactly ${flashcardCount} flashcards for active recall. Each has a clear question and a concise answer (1-2 sentences). Cover a good spread of topics.

2. QUIZ: ${mcqCount} multiple-choice questions (exactly 4 options each, one correct, 0-indexed answer), ${shortCount} short-answer questions (no options), and ${longCount} long-answer questions (no options).

3. REVISION SHEET: group related topics into logical units and produce 3-4 short bullet points per unit covering the most exam-important facts.

Respond ONLY with strict JSON in this exact shape, no markdown fences, no extra text:
{
  "flashcards": [ { "q": "string", "a": "string" }, ... ],
  "quiz": {
    "mcq": [ { "q": "string", "options": ["string","string","string","string"], "answer": 0 }, ... ],
    "short": [ { "q": "string" }, ... ],
    "long": [ { "q": "string" }, ... ]
  },
  "revision": [ { "unit": "string", "points": ["string", ...] }, ... ]
}

NOTES:
${context}`;

  try {
    const parsed = await callJSON(prompt);
    return {
      flashcards: parsed.flashcards || [],
      quiz: parsed.quiz || { mcq: [], short: [], long: [] },
      revision: parsed.revision || [],
    };
  } catch (err) {
    // Combined response was likely truncated (too long for the model's output
    // token limit). Fall back to two smaller calls: flashcards+quiz first,
    // then the revision sheet.
    console.warn('[studyMaterialService] Combined call failed, trying two-call fallback:', err.message);
    try {
      const [part1, part2] = await Promise.allSettled([
        callJSON(`From the study notes below, generate flashcards and a quiz in one response.

FLASHCARDS: exactly ${flashcardCount} flashcards. Each has a clear question and concise answer (1-2 sentences).
QUIZ: ${mcqCount} MCQ (4 options each, 0-indexed answer), ${shortCount} short-answer, ${longCount} long-answer questions.

Respond ONLY with strict JSON, no markdown:
{ "flashcards": [{"q":"","a":""}], "quiz": {"mcq":[{"q":"","options":["","","",""],"answer":0}],"short":[{"q":""}],"long":[{"q":""}]} }

NOTES:\n${context}`),
        callJSON(`From the study notes below, generate a revision sheet.

REVISION: group topics into units with 3-4 bullet points each covering exam-important facts.

Respond ONLY with strict JSON, no markdown:
{ "revision": [{"unit":"","points":[""]}] }

NOTES:\n${context}`),
      ]);

      const flashcardsAndQuiz = part1.status === 'fulfilled' ? part1.value : {};
      const revisionOnly = part2.status === 'fulfilled' ? part2.value : {};

      return {
        flashcards: flashcardsAndQuiz.flashcards || [],
        quiz: flashcardsAndQuiz.quiz || { mcq: [], short: [], long: [] },
        revision: revisionOnly.revision || [],
      };
    } catch (fallbackErr) {
      console.error('[studyMaterialService] Fallback also failed, returning empty study material:', fallbackErr.message);
      return {
        flashcards: [],
        quiz: { mcq: [], short: [], long: [] },
        revision: [],
      };
    }
  }
}

// ── No-AI fallback so the tabs are never empty ──
const plain = (t) => String(t || '').replace(/^#+\s*/gm, '').replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, '').replace(/\s+/g, ' ').trim();
const sentences = (t) => (plain(t).match(/[^.!?]+[.!?]+(?=\s|$)/g) || [plain(t)]).map((x) => x.trim()).filter((x) => x.length > 20);
const clip = (t, n) => (t.length > n ? t.slice(0, t.lastIndexOf(' ', n)) + '…' : t);

function buildLocalStudyMaterial(notes) {
  const pool = pickNotes(notes, 40).filter((n) => sentences(n.content).length);
  const pick = (n) => (pool.length <= n ? pool : Array.from({ length: n }, (_, i) => pool[Math.floor((i * pool.length) / n)]));

  const flashcards = pick(12).map((n) => ({ q: `Explain: ${n.title}`, a: clip(sentences(n.content).slice(0, 2).join(' '), 260) }));

  const mcqNotes = pick(5);
  const mcq = mcqNotes.map((n, i) => {
    const right = clip(sentences(n.content)[0], 160);
    const wrong = pool.filter((x) => x !== n).filter((_, j) => j % Math.max(1, Math.floor(pool.length / 3)) === i % 3).slice(0, 3).map((x) => clip(sentences(x.content)[0], 160));
    while (wrong.length < 3) wrong.push('None of the above');
    const answer = i % 4;
    const options = [...wrong]; options.splice(answer, 0, right);
    return { q: `Which statement correctly describes "${n.title}"?`, options: options.slice(0, 4), answer };
  });
  const short = pick(4).map((n) => ({ q: `Briefly explain ${n.title}.` }));
  const long = pick(3).map((n) => ({ q: `Discuss ${n.title} in detail, with examples where relevant.` }));

  const revision = pick(10).map((n) => ({ unit: n.title, points: sentences(n.content).slice(0, 3).map((x) => clip(x, 180)) }));
  return { flashcards, quiz: { mcq, short, long }, revision };
}

/**
 * Used by the pipeline: runs alongside embedding/saving, bounded by a timeout,
 * and always returns something usable (AI result, else built locally).
 */
async function generateStudyMaterialFast(notes, timeoutMs = 60000) {
  const local = () => buildLocalStudyMaterial(notes);
  try {
    const ai = await Promise.race([
      generateAllStudyMaterial(notes),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), timeoutMs)),
    ]);
    const ok = ai && ai.flashcards.length && ai.quiz.mcq.length && ai.revision.length;
    if (ok) return ai;
    const l = local();
    return {
      flashcards: ai?.flashcards?.length ? ai.flashcards : l.flashcards,
      quiz: ai?.quiz?.mcq?.length ? ai.quiz : l.quiz,
      revision: ai?.revision?.length ? ai.revision : l.revision,
    };
  } catch (err) {
    console.warn('[studyMaterial] AI generation unavailable, built locally:', err.message);
    return local();
  }
}

module.exports = {
  generateStudyMaterialFast,
  buildLocalStudyMaterial,
  generateFlashcards,
  generateQuiz,
  generateRevisionSheet,
  generateAllStudyMaterial,
};