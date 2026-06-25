// backend/models/QPChunk.js
// ─────────────────────────────────────────────
//  Chunks from previous-year question papers, kept
//  in a SEPARATE collection from study-material chunks
//  so exam analysis / QP-RAG never mixes with the main
//  knowledge base, per the project spec.
//
//  Needs its own Atlas Vector Search index, named
//  process.env.QP_VECTOR_INDEX_NAME.
// ─────────────────────────────────────────────

const mongoose = require('mongoose');

const qpChunkSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    sourceDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SourceDocument', required: true, index: true },

    sourceFileName: { type: String, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },

    // Extracted during exam analysis
    detectedTopic: { type: String, default: null },
    year: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('QPChunk', qpChunkSchema);