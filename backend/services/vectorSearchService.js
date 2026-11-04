// backend/services/vectorSearchService.js
// ─────────────────────────────────────────────
//  Phase 10 / RAG Retriever: queries MongoDB Atlas
//  Vector Search to find the most relevant chunks
//  for a given question.
// ─────────────────────────────────────────────

const mongoose = require('mongoose');
const Chunk = require('../models/Chunk');
const QPChunk = require('../models/QPChunk');
const UnifiedNote = require('../models/UnifiedNote');
const { embedText, cosineSimilarity } = require('./embeddingService');

/**
 * Retrieve top-K relevant chunks from the unified knowledge base
 * for a given project, using Atlas Vector Search.
 *
 * @param {string} projectId
 * @param {string} query
 * @param {number} k
 */
async function atlasChunks(projectId, query, k = 5) {
  const queryVector = await embedText(query);

  const results = await Chunk.aggregate([
    {
      $vectorSearch: {
        index: process.env.VECTOR_INDEX_NAME || 'vector_index',
        path: 'embedding',
        queryVector,
        numCandidates: 100,
        limit: k,
        // projectId is stored as an ObjectId in the Chunk collection, but
        // arrives here as a plain string from req.params — Atlas Search
        // filter matching is type-strict, so it MUST be cast or it will
        // silently match nothing.
        filter: { projectId: { $eq: new mongoose.Types.ObjectId(projectId) } },
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
 * Retrieve top-K relevant FUSED notes (the deduplicated knowledge base).
 * Requires the note vector index (run scripts/createVectorIndex.js). Projects
 * processed before notes were embedded simply return no results here.
 */
async function atlasNotes(projectId, query, k = 5) {
  const queryVector = await embedText(query);

  return UnifiedNote.aggregate([
    {
      $vectorSearch: {
        index: process.env.NOTE_VECTOR_INDEX_NAME || 'note_vector_index',
        path: 'embedding',
        queryVector,
        numCandidates: 100,
        limit: k,
        filter: { projectId: { $eq: new mongoose.Types.ObjectId(projectId) } },
      },
    },
    {
      $project: {
        title: 1,
        content: 1,
        sources: 1,
        sourceRefs: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ]);
}

/**
 * Retrieve top-K relevant chunks from the question-paper collection.
 */
async function atlasQP(projectId, query, k = 5) {
  const queryVector = await embedText(query);

  const results = await QPChunk.aggregate([
    {
      $vectorSearch: {
        index: process.env.QP_VECTOR_INDEX_NAME || 'qp_vector_index',
        path: 'embedding',
        queryVector,
        numCandidates: 100,
        limit: k,
        filter: { projectId: { $eq: new mongoose.Types.ObjectId(projectId) } },
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


// ─────────────────────────────────────────────
//  Index-free fallback. Atlas $vectorSearch silently returns [] when the vector
//  index doesn't exist (or is still building) — which made the chatbot say it
//  "couldn't find anything". A project has at most a few hundred notes/chunks, so
//  ranking them in memory (cosine + keyword overlap) is instant and always works.
// ─────────────────────────────────────────────
const STOP = new Set('the a an of and or to in on for is are was were what which who how why does do did with by as at from that this it be can you me my about tell explain summarize summary topic'.split(' '));
function words(t) { return (String(t).toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w)); }

function rank(docs, query, queryVector, k, textOf, titleOf) {
  const qw = new Set(words(query));
  const scored = docs.map((d) => {
    const sem = d.embedding && d.embedding.length === queryVector.length ? cosineSimilarity(queryVector, d.embedding) : 0;
    let kw = 0;
    if (qw.size) {
      const tw = new Set(words(`${titleOf ? titleOf(d) : ''} ${textOf(d)}`));
      let hit = 0;
      qw.forEach((w) => { if (tw.has(w)) hit++; });
      kw = hit / qw.size;
      if (titleOf) {
        const ti = new Set(words(titleOf(d)));
        let th = 0; qw.forEach((w) => { if (ti.has(w)) th++; });
        kw += 0.3 * (th / qw.size);
      }
    }
    return { d, score: sem + 0.35 * kw };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((x) => ({ ...x.d, embedding: undefined, score: x.score }));
}

async function localNotes(projectId, query, k) {
  const [queryVector, docs] = await Promise.all([
    embedText(query),
    UnifiedNote.find({ projectId }).select('+embedding title content sources sourceRefs order').lean(),
  ]);
  return rank(docs, query, queryVector, k, (d) => d.content, (d) => d.title);
}
async function localChunks(projectId, query, k) {
  const [queryVector, docs] = await Promise.all([
    embedText(query),
    Chunk.find({ projectId }).select('+embedding text sourceFileName pageNumber').lean(),
  ]);
  return rank(docs, query, queryVector, k, (d) => d.text);
}
async function localQP(projectId, query, k) {
  const [queryVector, docs] = await Promise.all([
    embedText(query),
    QPChunk.find({ projectId }).select('+embedding text sourceFileName detectedTopic').lean(),
  ]);
  return rank(docs, query, queryVector, k, (d) => d.text);
}

async function withFallback(atlasFn, localFn, projectId, query, k) {
  try {
    const r = await atlasFn(projectId, query, k);
    if (r && r.length) return r;
  } catch (err) {
    console.warn('[vectorSearch] Atlas search failed, using in-memory search:', err.message);
  }
  return localFn(projectId, query, k);
}

const retrieveRelevantNotes = (p, q, k = 5) => withFallback(atlasNotes, localNotes, p, q, k);
const retrieveRelevantChunks = (p, q, k = 5) => withFallback(atlasChunks, localChunks, p, q, k);
const retrieveRelevantQPChunks = (p, q, k = 5) => withFallback(atlasQP, localQP, p, q, k);

module.exports = { retrieveRelevantChunks, retrieveRelevantNotes, retrieveRelevantQPChunks };
