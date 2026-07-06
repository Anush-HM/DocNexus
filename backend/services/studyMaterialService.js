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
 * Uses reduced counts vs. the individual generators to stay within the
 * model's output token limit when all four are combined in one response.
 * Falls back to two separate calls (flashcards+quiz, then revision+interview)
 * if the combined response is still too long (e.g. very large note sets).
 */
async function generateAllStudyMaterial(
  notes,
  { flashcardCount = 8, mcqCount = 4, shortCount = 3, longCount = 2, interviewCount = 6 } = {}
) {
  const context = buildNotesContext(notes);

  const prompt = `From the study notes below, generate ALL FOUR of the following study materials in one response:

1. FLASHCARDS: exactly ${flashcardCount} flashcards for active recall. Each has a clear question and a concise answer (1-2 sentences). Cover a good spread of topics.

2. QUIZ: ${mcqCount} multiple-choice questions (exactly 4 options each, one correct, 0-indexed answer), ${shortCount} short-answer questions (no options), and ${longCount} long-answer questions (no options).

3. REVISION SHEET: group related topics into logical units and produce 3-4 short bullet points per unit covering the most exam-important facts.

4. INTERVIEW PREP: exactly ${interviewCount} interview/viva questions with model answers (2-3 sentences each). Mark each as "technical", "viva", or "interview".

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
    // Combined response was likely truncated (too long for the model's output
    // token limit). Fall back to two smaller calls: flashcards+quiz first,
    // then revision+interview prep. This costs 2 API calls instead of 1 but
    // still far fewer than the original 4 separate calls.
    console.warn('[studyMaterialService] Combined call failed, trying two-call fallback:', err.message);
    try {
      const [part1, part2] = await Promise.allSettled([
        callJSON(`From the study notes below, generate flashcards and a quiz in one response.

FLASHCARDS: exactly ${flashcardCount} flashcards. Each has a clear question and concise answer (1-2 sentences).
QUIZ: ${mcqCount} MCQ (4 options each, 0-indexed answer), ${shortCount} short-answer, ${longCount} long-answer questions.

Respond ONLY with strict JSON, no markdown:
{ "flashcards": [{"q":"","a":""}], "quiz": {"mcq":[{"q":"","options":["","","",""],"answer":0}],"short":[{"q":""}],"long":[{"q":""}]} }

NOTES:\n${context}`),
        callJSON(`From the study notes below, generate a revision sheet and interview prep questions.

REVISION: group topics into units with 3-4 bullet points each covering exam-important facts.
INTERVIEW PREP: exactly ${interviewCount} questions with 2-3 sentence answers. Mark each as "technical", "viva", or "interview".

Respond ONLY with strict JSON, no markdown:
{ "revision": [{"unit":"","points":[""]}], "interviewPrep": [{"q":"","a":"","category":"technical"}] }

NOTES:\n${context}`),
      ]);

      const flashcardsAndQuiz = part1.status === 'fulfilled' ? part1.value : {};
      const revisionAndInterview = part2.status === 'fulfilled' ? part2.value : {};

      return {
        flashcards: flashcardsAndQuiz.flashcards || [],
        quiz: flashcardsAndQuiz.quiz || { mcq: [], short: [], long: [] },
        revision: revisionAndInterview.revision || [],
        interviewPrep: revisionAndInterview.interviewPrep || [],
      };
    } catch (fallbackErr) {
      console.error('[studyMaterialService] Fallback also failed, returning empty study material:', fallbackErr.message);
      return {
        flashcards: [],
        quiz: { mcq: [], short: [], long: [] },
        revision: [],
        interviewPrep: [],
      };
    }
  }
}

module.exports = {
  generateFlashcards,
  generateQuiz,
  generateRevisionSheet,
  generateInterviewPrep,
  generateAllStudyMaterial,
};