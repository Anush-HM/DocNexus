// backend/models/Project.js
// ─────────────────────────────────────────────
//  Project = one "fusion session" the user creates
//  by uploading a set of PDFs together.
// ─────────────────────────────────────────────

const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    topic: { type: String, default: '' },

    // Owner (account) and a readable name for the "My projects" list
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    title: { type: String, default: '' },

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

    // Tracks flashcards/quiz/revision generation SEPARATELY from the main
    // notes pipeline, so the Notes tab becomes available as soon as fusion
    // finishes instead of waiting for study material too. Mirrors the same
    // pattern as qpStatus below.
    studyMaterialStatus: {
      type: String,
      enum: ['processing', 'ready', 'failed'],
      default: 'processing',
    },

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
    examTopics: [{
      _id: false,
      topic: String,
      count: Number,
      papers: [{ _id: false, name: String, year: String, count: Number }], // which paper(s)/year(s) asked it
      questions: [String], // a few of the actual questions
    }],

    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);