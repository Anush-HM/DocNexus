// backend/services/embeddingService.js
// ─────────────────────────────────────────────
//  Phase 4: Embedding Generation (LangChain.js + Gemini)
//  Converts text chunks into vector embeddings for
//  semantic similarity search and RAG retrieval.
// ─────────────────────────────────────────────

const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');

const EMBEDDING_DIMENSIONS = 1536; // matches the Atlas Vector Search index definition

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-embedding-001', // outputs 3072 dims by default; truncated below to 1536
  outputDimensionality: EMBEDDING_DIMENSIONS,
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
 * Embed many chunks of text. The Gemini embedding model only accepts one
 * input per request (unlike OpenAI's batched embeddings API), so this
 * goes one at a time with a small concurrency cap to stay within the
 * free-tier rate limits (15 requests/minute on Flash-family models).
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(texts, concurrency = 5) {
  const results = new Array(texts.length);
  for (let i = 0; i < texts.length; i += concurrency) {
    const slice = texts.slice(i, i + concurrency);
    const vectors = await Promise.all(slice.map((t) => embeddings.embedQuery(t)));
    vectors.forEach((v, j) => { results[i + j] = v; });
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