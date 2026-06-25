// backend/models/Project.js
// ─────────────────────────────────────────────
//  Project = one "fusion session" the user creates
//  by uploading a set of PDFs together.
// ─────────────────────────────────────────────

const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    topic: { type: String, default: '' },

    status: {
      type: String,
      enum: ['uploading', 'processing', 'ready', 'failed'],
      default: 'uploading',
    },

    // High-level progress tracking shown on the processing screen
    progress: {
      step: { type: String, default: 'extract' }, // extract|chunk|embed|match|dedupe|conflict|fuse|done
      pct: { type: Number, default: 0 },
    },

    // Filled in once fusion completes
    stats: {
      topicsMerged: { type: Number, default: 0 },
      duplicatesRemoved: { type: Number, default: 0 },
      conflictsFound: { type: Number, default: 0 },
      sourcesUsed: { type: Number, default: 0 },
    },

    hasQuestionPapers: { type: Boolean, default: false },

    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);