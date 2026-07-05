// backend/services/studyMaterialService.js
// ─────────────────────────────────────────────
//  Generates flashcards, quizzes, revision sheets,
//  and interview-prep questions from the fused
//  Unified Notes of a project.
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

function buildNotesContext(notes) {
  return notes
    .map((n) => `### ${n.title}\n${n.content}`)
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
 * Generate interview / viva preparation questions.
 */
async function generateInterviewPrep(notes, count = 10) {
  const context = buildNotesContext(notes);
  const prompt = `From the study notes below, generate exactly ${count} interview/viva preparation questions a student might be asked about these topics, each with a model answer (2-4 sentences). Mark each as one of: "technical", "viva", "interview".

Respond ONLY with strict JSON, no markdown fences:
{ "interviewPrep": [ { "q": "string", "a": "string", "category": "technical|viva|interview" }, ... ] }

NOTES:
${context}`;
  const parsed = await callJSON(prompt);
  return parsed.interviewPrep || [];
}

/**
 * Generate flashcards, quiz, revision sheet, and interview prep all in
 * ONE LLM call instead of 4 separate ones. This is the main entry point
 * used right after fusion completes.
 *
 * Why combined: 4 separate calls per upload adds up fast against a
 * free-tier daily request cap (e.g. Gemini's per-project limit can be as
 * low as 20/day) — on top of the calls fusion itself already makes.
 * Combining into one call cuts this part of the pipeline from 4 requests
 * to 1, with no real quality loss since the model has plenty of context
 * window to produce all four outputs in one structured response.
 */
async function generateAllStudyMaterial(
  notes,
  { flashcardCount = 12, mcqCount = 5, shortCount = 5, longCount = 3, interviewCount = 10 } = {}
) {
  const context = buildNotesContext(notes);

  const prompt = `From the study notes below, generate ALL FOUR of the following study materials in one response:

1. FLASHCARDS: exactly ${flashcardCount} flashcards for active recall. Each has a clear, specific question and a concise, accurate answer (1-3 sentences). Cover a good spread of topics.

2. QUIZ: ${mcqCount} multiple-choice questions (exactly 4 options each, one correct, 0-indexed answer), ${shortCount} short-answer questions (no options), and ${longCount} long-answer/essay questions (no options).

3. REVISION SHEET: group related topics into logical units (e.g. "Deadlock", "CPU Scheduling") and produce 4-6 short, high-density bullet points per unit covering the most exam-important facts.

4. INTERVIEW PREP: exactly ${interviewCount} interview/viva preparation questions a student might be asked about these topics, each with a model answer (2-4 sentences). Mark each as one of: "technical", "viva", "interview".

Respond ONLY with strict JSON in this exact shape, no markdown fences, no extra text:
{
  "flashcards": [ { "q": "string", "a": "string" }, ... ],
  "quiz": {
    "mcq": [ { "q": "string", "options": ["string","string","string","string"], "answer": 0 }, ... ],
    "short": [ { "q": "string" }, ... ],
    "long": [ { "q": "string" }, ... ]
  },
  "revision": [ { "unit": "string", "points": ["string", ...] }, ... ],
  "interviewPrep": [ { "q": "string", "a": "string", "category": "technical|viva|interview" }, ... ]
}

NOTES:
${context}`;

  try {
    const parsed = await callJSON(prompt);
    return {
      flashcards: parsed.flashcards || [],
      quiz: parsed.quiz || { mcq: [], short: [], long: [] },
      revision: parsed.revision || [],
      interviewPrep: parsed.interviewPrep || [],
    };
  } catch (err) {
    // If the combined call fails entirely (e.g. sustained outage after
    // all retries), degrade gracefully — the user still gets their notes
    // and conflicts from fusion, just without auto-generated study aids.
    console.error('[studyMaterialService] Combined generation failed, returning empty study material:', err.message);
    return {
      flashcards: [],
      quiz: { mcq: [], short: [], long: [] },
      revision: [],
      interviewPrep: [],
    };
  }
}

module.exports = {
  generateFlashcards,
  generateQuiz,
  generateRevisionSheet,
  generateInterviewPrep,
  generateAllStudyMaterial,
};