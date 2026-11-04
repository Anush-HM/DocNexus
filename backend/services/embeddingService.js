// backend/services/embeddingService.js
// ─────────────────────────────────────────────
//  Phase 4: Embedding Generation (LangChain.js + Cohere)
//  Converts text chunks into vector embeddings for
//  semantic similarity search and RAG retrieval.
//
//  Cohere's embed-english-v3.0 outputs 1024 dimensions.
//  Cohere requires different input_type values for documents
//  (text being stored/indexed) vs queries (text being searched).
// ─────────────────────────────────────────────

const { CohereEmbeddings } = require('@langchain/cohere');

const EMBEDDING_DIMENSIONS = 1024; // embed-english-v3.0 native output size

const documentEmbeddings = new CohereEmbeddings({
  apiKey: process.env.COHERE_API_KEY,
  model: 'embed-english-v3.0',
  inputType: 'search_document', // for PDF chunks being stored/indexed
});

const queryEmbeddings = new CohereEmbeddings({
  apiKey: process.env.COHERE_API_KEY,
  model: 'embed-english-v3.0',
  inputType: 'search_query', // for chatbot questions being searched
});

/**
 * Embed a single search query (e.g. a chatbot question).
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embedText(text) {
  return queryEmbeddings.embedQuery(text);
}

/**
 * Embed many document chunks for storage/indexing.
 * Cohere accepts batches natively (up to 96 per call).
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(texts, batchSize = 90, concurrency = 3) {
  const batches = [];
  for (let i = 0; i < texts.length; i += batchSize) batches.push(texts.slice(i, i + batchSize));

  // several batches in flight at once instead of strictly one after another
  const results = new Array(batches.length);
  let next = 0;
  async function worker() {
    while (next < batches.length) {
      const idx = next++;
      results[idx] = await documentEmbeddings.embedDocuments(batches[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
  return results.flat();
}

/**
 * Cosine similarity between two equal-length vectors.
 * Used by the fusion engine for topic matching / dedup.
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