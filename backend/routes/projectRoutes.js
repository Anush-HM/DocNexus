// backend/routes/projectRoutes.js
// ─────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const upload = require('../utils/uploadMiddleware');
const { uploadProject, getStatus, getResults, uploadQuestionPapers, getQPStatus } = require('../controllers/projectController');
const { askQuestion } = require('../controllers/chatController');
const { getExamAnalysis, askExamQuestion } = require('../controllers/examController');

// POST /api/projects/upload
router.post(
  '/upload',
  upload.fields([
    { name: 'files', maxCount: 20 },
    { name: 'questionPapers', maxCount: 20 },
  ]),
  uploadProject
);

// GET /api/projects/:id/status
router.get('/:id/status', getStatus);

// GET /api/projects/:id/results
router.get('/:id/results', getResults);

// POST /api/projects/:id/question-papers  (uploaded later, from results.html)
router.post(
  '/:id/question-papers',
  upload.fields([{ name: 'questionPapers', maxCount: 20 }]),
  uploadQuestionPapers
);

// GET /api/projects/:id/qp-status
router.get('/:id/qp-status', getQPStatus);

// POST /api/projects/:id/chat
router.post('/:id/chat', askQuestion);

// GET /api/projects/:id/exam-analysis
router.get('/:id/exam-analysis', getExamAnalysis);

// POST /api/projects/:id/exam-question
router.post('/:id/exam-question', askExamQuestion);

module.exports = router;