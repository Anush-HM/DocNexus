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
      step: { type: String, default: 'extract' }, // extract|understand|match|conflict|fuse|studymaterial|done
      // NOTE: these are internal keys only. The frontend NEVER displays
      // them raw — it maps each to a friendly, outcome-focused sentence
      // (see STEP_LABELS in frontend/js/app.js). Dedup runs silently
      // inside the fusion engine and has no separate user-facing stage.
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

    // Tracks the SEPARATE, optional flow where question papers are
    // uploaded later from results.html (not during initial upload).
    qpStatus: {
      type: String,
      enum: ['none', 'processing', 'ready', 'failed'],
      default: 'none',
    },
    qpErrorMessage: { type: String, default: null },

    // Cached exam-analysis result so results.html doesn't have to
    // re-run the LLM topic-frequency analysis on every page load.
    examTopics: [{ topic: String, count: Number }],

    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);