// backend/services/llmService.js
// ─────────────────────────────────────────────
//  Shared Cohere Chat model instance, used by the
//  fusion engine, RAG chatbot, and study-material
//  generators. Centralized so model/temperature
//  tuning happens in one place.
// ─────────────────────────────────────────────

const { ChatCohere } = require('@langchain/cohere');

let chatModel = null;

/**
 * @param {object} overrides - optional per-call overrides (e.g. temperature)
 */
function getChatModel(overrides = {}) {
  if (!chatModel) {
    chatModel = new ChatCohere({
      apiKey: process.env.COHERE_API_KEY,
      model: 'command-r-plus-08-2024', // free trial tier — RAG/long-context optimized
      temperature: 0.3,
      maxRetries: 5,
    });
  }
  if (Object.keys(overrides).length === 0) return chatModel;
  return new ChatCohere({
    apiKey: process.env.COHERE_API_KEY,
    model: 'command-r-plus-08-2024',
    temperature: 0.3,
    maxRetries: 5,
    ...overrides,
  });
}

module.exports = { getChatModel };