// backend/models/Chunk.js
// ─────────────────────────────────────────────
//  A semantic chunk of text from a source document,
//  with its Cohere embedding vector attached.
//  This is the collection Atlas Vector Search indexes.
//
//  IMPORTANT: After this collection has data, create a
//  Vector Search index in Atlas UI (or via API) named
//  process.env.VECTOR_INDEX_NAME on the `embedding` field,
//  with numDimensions: 1024 (Cohere embed-english-v3.0)
//  and similarity: "cosine". See backend/scripts/createVectorIndex.js
// ─────────────────────────────────────────────

const mongoose = require('mongoose');

const chunkSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    sourceDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SourceDocument', required: true, index: true },

    sourceFileName: { type: String, required: true }, // denormalized for fast citation display
    pageNumber: { type: Number, default: null },

    text: { type: String, required: true },

    embedding: { type: [Number], required: true }, // length 1024

    // Filled in during fusion (topic matching / dedupe), optional until then
    topicLabel: { type: String, default: null },
    isDuplicate: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Chunk', chunkSchema);