// backend/models/SourceDocument.js
// ─────────────────────────────────────────────
//  One uploaded PDF, belonging to a Project.
//  type distinguishes regular study material from
//  previous-year question papers.
// ─────────────────────────────────────────────

const mongoose = require('mongoose');

const sourceDocumentSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },

    fileName: { type: String, required: true },
    filePath: { type: String, required: true }, // path on disk under /uploads
    fileSizeMB: { type: Number, default: 0 },

    type: { type: String, enum: ['material', 'question_paper'], default: 'material' },

    rawText: { type: String, default: '' }, // full extracted text (kept for re-chunking if needed)
    pageCount: { type: Number, default: 0 },

    status: { type: String, enum: ['pending', 'extracted', 'failed'], default: 'pending' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SourceDocument', sourceDocumentSchema);