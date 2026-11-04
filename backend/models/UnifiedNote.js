// backend/models/UnifiedNote.js
// ─────────────────────────────────────────────
//  Output of the Knowledge Fusion Engine: one
//  unified, deduplicated explanation per topic.
// ─────────────────────────────────────────────

const mongoose = require('mongoose');

const unifiedNoteSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },

    title: { type: String, required: true },
    content: { type: String, required: true }, // fused, written-out explanation

    sources: [{ type: String }], // file names that contributed to this topic
    sourceRefs: [{ type: String }], // "file.pdf p.12" style citations for the chatbot

    // Embedding of title + content, used by the chatbot's vector search.
    // select:false keeps the 1024 floats out of normal API responses.
    embedding: { type: [Number], select: false },
    diagrams: [{
      description: { type: String },
      svg: { type: String },   // legacy AI-generated diagrams
      image: { type: String }, // real figure cropped from the PDF (data: URI)
    }],

    hasConflict: { type: Boolean, default: false },
    conflictId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conflict', default: null },

    order: { type: Number, default: 0 }, // display order on the Notes tab
  },
  { timestamps: true }
);

module.exports = mongoose.model('UnifiedNote', unifiedNoteSchema);