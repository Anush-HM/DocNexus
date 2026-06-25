// backend/models/Conflict.js
// ─────────────────────────────────────────────
//  A detected contradiction between two (or more)
//  sources on the same topic.
// ─────────────────────────────────────────────

const mongoose = require('mongoose');

const conflictSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },

    topic: { type: String, required: true },

    sourceA: {
      name: { type: String, required: true },
      claim: { type: String, required: true },
    },
    sourceB: {
      name: { type: String, required: true },
      claim: { type: String, required: true },
    },

    recommended: { type: String, default: '' }, // AI-suggested resolution + reasoning
  },
  { timestamps: true }
);

module.exports = mongoose.model('Conflict', conflictSchema);