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
 * Generate all study materials in one go (used right after fusion completes).
 */
async function generateAllStudyMaterial(notes) {
  const [flashcards, quiz, revision, interviewPrep] = await Promise.all([
    generateFlashcards(notes),
    generateQuiz(notes),
    generateRevisionSheet(notes),
    generateInterviewPrep(notes),
  ]);
  return { flashcards, quiz, revision, interviewPrep };
}

module.exports = {
  generateFlashcards,
  generateQuiz,
  generateRevisionSheet,
  generateInterviewPrep,
  generateAllStudyMaterial,
};