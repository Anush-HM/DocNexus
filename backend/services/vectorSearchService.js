// backend/services/vectorSearchService.js
// ─────────────────────────────────────────────
//  Phase 10 / RAG Retriever: queries MongoDB Atlas
//  Vector Search to find the most relevant chunks
//  for a given question.
// ─────────────────────────────────────────────

const Chunk = require('../models/Chunk');
const QPChunk = require('../models/QPChunk');
const { embedText } = require('./embeddingService');

/**
 * Retrieve top-K relevant chunks from the unified knowledge base
 * for a given project, using Atlas Vector Search.
 *
 * @param {string} projectId
 * @param {string} query
 * @param {number} k
 */
async function retrieveRelevantChunks(projectId, query, k = 5) {
  const queryVector = await embedText(query);

  const results = await Chunk.aggregate([
    {
      $vectorSearch: {
        index: process.env.VECTOR_INDEX_NAME || 'vector_index',
        path: 'embedding',
        queryVector,
        numCandidates: 100,
        limit: k,
        filter: { projectId: { $eq: projectId } },
      },
    },
    {
      $project: {
        text: 1,
        sourceFileName: 1,
        pageNumber: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ]);

  return results;
}

/**
 * Retrieve top-K relevant chunks from the question-paper collection.
 */
async function retrieveRelevantQPChunks(projectId, query, k = 5) {
  const queryVector = await embedText(query);

  const results = await QPChunk.aggregate([
    {
      $vectorSearch: {
        index: process.env.QP_VECTOR_INDEX_NAME || 'qp_vector_index',
        path: 'embedding',
        queryVector,
        numCandidates: 100,
        limit: k,
        filter: { projectId: { $eq: projectId } },
      },
    },
    {
      $project: {
        text: 1,
        sourceFileName: 1,
        detectedTopic: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ]);

  return results;
}

module.exports = { retrieveRelevantChunks, retrieveRelevantQPChunks };