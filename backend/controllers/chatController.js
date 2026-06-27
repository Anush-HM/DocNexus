// backend/controllers/chatController.js
// ─────────────────────────────────────────────

const { answerQuestion } = require('../services/ragService');

/**
 * POST /api/projects/:id/chat
 * Body: { question: string, includeQuestionPapers?: boolean }
 */
async function askQuestion(req, res) {
  try {
    const { question, includeQuestionPapers } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'question is required' });
    }

    const result = await answerQuestion(req.params.id, question, !!includeQuestionPapers);
    res.json(result);
  } catch (err) {
    console.error('[askQuestion]', err);
    res.status(500).json({ error: 'Failed to answer question' });
  }
}

module.exports = { askQuestion };