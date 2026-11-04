// backend/routes/projectRoutes.js
// ─────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const upload = require('../utils/uploadMiddleware');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const { requireAuth } = require('../services/authService');
const { listProjects, deleteProject, uploadProject, getStatus, getResults, uploadQuestionPapers, getQPStatus, getStudyMaterialStatus, exportPdf } = require('../controllers/projectController');
const { askQuestion } = require('../controllers/chatController');
const { getExamAnalysis, askExamQuestion } = require('../controllers/examController');

// Every project route needs a signed-in user, and a project can only be opened by its owner.
router.use(requireAuth);
router.param('id', async (req, res, next, id) => {
  try {
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'Project not found' });
    const owned = await Project.exists({ _id: id, userId: req.userId });
    if (!owned) return res.status(404).json({ error: 'Project not found' });
    next();
  } catch (e) { next(e); }
});

// GET /api/projects  -> my saved projects;  DELETE /api/projects/:id
router.get('/', listProjects);
router.delete('/:id', deleteProject);

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
router.get('/:id/export/:kind', exportPdf);

// POST /api/projects/:id/question-papers  (uploaded later, from results.html)
router.post(
  '/:id/question-papers',
  upload.fields([{ name: 'questionPapers', maxCount: 20 }]),
  uploadQuestionPapers
);

// GET /api/projects/:id/qp-status
router.get('/:id/qp-status', getQPStatus);

// GET /api/projects/:id/study-material-status
router.get('/:id/study-material-status', getStudyMaterialStatus);

// POST /api/projects/:id/chat
router.post('/:id/chat', askQuestion);

// GET /api/projects/:id/exam-analysis
router.get('/:id/exam-analysis', getExamAnalysis);

// POST /api/projects/:id/exam-question
router.post('/:id/exam-question', askExamQuestion);

module.exports = router;