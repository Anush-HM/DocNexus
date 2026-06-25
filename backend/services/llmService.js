// backend/services/llmService.js
// ─────────────────────────────────────────────
//  Shared OpenAI Chat model instance, used by the
//  fusion engine, RAG chatbot, and study-material
//  generators. Centralized so model/temperature
//  tuning happens in one place.
// ─────────────────────────────────────────────

const { ChatOpenAI } = require('@langchain/openai');

let chatModel = null;

/**
 * @param {object} overrides - optional per-call overrides (e.g. temperature)
 */
function getChatModel(overrides = {}) {
  if (!chatModel) {
    chatModel = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-4o-mini', // good balance of quality/cost for fusion + RAG + generation
      temperature: 0.3,
    });
  }
  if (Object.keys(overrides).length === 0) return chatModel;
  // Return a fresh instance when caller needs different settings (e.g. higher temp for flashcards)
  return new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: 'gpt-4o-mini',
    temperature: 0.3,
    ...overrides,
  });
}

module.exports = { getChatModel };