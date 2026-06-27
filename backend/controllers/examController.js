// backend/controllers/examController.js
// ─────────────────────────────────────────────

const Project = require('../models/Project');
const { answerQuestion } = require('../services/ragService');

/**
 * GET /api/projects/:id/exam-analysis
 * Returns the cached most-asked-topics result computed when question
 * papers were uploaded (see processQuestionPapers in pipelineService).
 * Re-computing on every call would be slow and re-bill the LLM for no
 * reason, since the underlying question papers don't change between views.
 */
async function getExamAnalysis(req, res) {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (project.qpStatus === 'none') {
      return res.json({ topics: [], message: 'No question papers uploaded for this project yet.' });
    }
    if (project.qpStatus === 'processing') {
      return res.json({ topics: [], message: 'Still analysing your question papers...' });
    }
    if (project.qpStatus === 'failed') {
      return res.status(500).json({ topics: [], message: project.qpErrorMessage || 'Exam analysis failed.' });
    }

    res.json({ topics: project.examTopics || [] });
  } catch (err) {
    console.error('[getExamAnalysis]', err);
    res.status(500).json({ error: 'Failed to fetch exam analysis' });
  }
}

/**
 * POST /api/projects/:id/exam-question
 * Body: { question: string }
 * "Was Deadlock frequently asked?" style queries against QP chunks.
 */
async function askExamQuestion(req, res) {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'question is required' });
    }
    const result = await answerQuestion(req.params.id, question, true);
    res.json(result);
  } catch (err) {
    console.error('[askExamQuestion]', err);
    res.status(500).json({ error: 'Failed to answer exam question' });
  }
}

module.exports = { getExamAnalysis, askExamQuestion };