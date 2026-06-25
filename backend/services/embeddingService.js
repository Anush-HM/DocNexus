// backend/services/embeddingService.js
// ─────────────────────────────────────────────
//  Phase 4: Embedding Generation (LangChain.js + OpenAI)
//  Converts text chunks into vector embeddings for
//  semantic similarity search and RAG retrieval.
// ─────────────────────────────────────────────

const { OpenAIEmbeddings } = require('@langchain/openai');

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  model: 'text-embedding-3-small', // 1536 dimensions, cheap + fast — good fit for this project
});

/**
 * Embed a single piece of text.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embedText(text) {
  return embeddings.embedQuery(text);
}

/**
 * Embed many chunks of text in batches (OpenAI embeddings API
 * accepts arrays, this is far cheaper than one-by-one calls).
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(texts, batchSize = 100) {
  const results = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const vectors = await embeddings.embedDocuments(batch);
    results.push(...vectors);
  }
  return results;
}

/**
 * Cosine similarity between two equal-length vectors.
 * Used by the fusion engine for topic matching / dedup
 * without round-tripping through Atlas for in-memory comparisons.
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = { embedText, embedBatch, cosineSimilarity };