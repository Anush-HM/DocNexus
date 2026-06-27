// backend/services/llmService.js
// ─────────────────────────────────────────────
//  Shared Gemini Chat model instance, used by the
//  fusion engine, RAG chatbot, and study-material
//  generators. Centralized so model/temperature
//  tuning happens in one place.
// ─────────────────────────────────────────────

const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');

let chatModel = null;

/**
 * @param {object} overrides - optional per-call overrides (e.g. temperature)
 */
function getChatModel(overrides = {}) {
  if (!chatModel) {
    chatModel = new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY,
      model: 'gemini-2.5-flash', // free-tier eligible, good balance of quality/cost
      temperature: 0.3,
    });
  }
  if (Object.keys(overrides).length === 0) return chatModel;
  // Return a fresh instance when caller needs different settings (e.g. higher temp for flashcards)
  return new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: 'gemini-2.5-flash',
    temperature: 0.3,
    ...overrides,
  });
}

module.exports = { getChatModel };