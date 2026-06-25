// backend/models/StudyMaterial.js
// ─────────────────────────────────────────────
//  Caches AI-generated flashcards / quiz / revision
//  sheet / interview prep so we don't regenerate on
//  every page load. One document per project.
// ─────────────────────────────────────────────

const mongoose = require('mongoose');

const flashcardSchema = new mongoose.Schema(
  { q: String, a: String },
  { _id: false }
);

const mcqSchema = new mongoose.Schema(
  { q: String, options: [String], answer: Number },
  { _id: false }
);

const shortLongSchema = new mongoose.Schema(
  { q: String },
  { _id: false }
);

const revisionSectionSchema = new mongoose.Schema(
  { unit: String, points: [String] },
  { _id: false }
);

const interviewQSchema = new mongoose.Schema(
  { q: String, a: String, category: { type: String, enum: ['technical', 'viva', 'interview'] } },
  { _id: false }
);

const studyMaterialSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true, index: true },

    flashcards: [flashcardSchema],

    quiz: {
      mcq: [mcqSchema],
      short: [shortLongSchema],
      long: [shortLongSchema],
    },

    revision: [revisionSectionSchema],

    interviewPrep: [interviewQSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('StudyMaterial', studyMaterialSchema);