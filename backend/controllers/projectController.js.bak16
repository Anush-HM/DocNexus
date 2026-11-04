// backend/controllers/projectController.js
// ─────────────────────────────────────────────

const Project = require('../models/Project');
const SourceDocument = require('../models/SourceDocument');
const UnifiedNote = require('../models/UnifiedNote');
const Conflict = require('../models/Conflict');
const StudyMaterial = require('../models/StudyMaterial');
const { buildNotesPdf, buildRevisionPdf } = require('../services/pdfExportService');
const { runPipeline, processQuestionPapers } = require('../services/pipelineService');

/**
 * POST /api/projects/upload
 * Accepts multipart form-data:
 *   - files: PDF[] (material) - required, min 2
 *   - questionPapers: PDF[] (optional)
 * Creates a Project + SourceDocuments, kicks off the pipeline async.
 */
async function uploadProject(req, res) {
  try {
    const materialFiles = req.files?.files || [];
    const qpFiles = req.files?.questionPapers || [];

    if (materialFiles.length < 2) {
      return res.status(400).json({ error: 'Please upload at least 2 study material PDFs.' });
    }

    const project = await Project.create({ status: 'uploading' });

    const materialDocs = materialFiles.map((f) => ({
      projectId: project._id,
      fileName: f.originalname,
      filePath: f.path,
      fileSizeMB: +(f.size / (1024 * 1024)).toFixed(2),
      type: 'material',
    }));

    const qpDocs = qpFiles.map((f) => ({
      projectId: project._id,
      fileName: f.originalname,
      filePath: f.path,
      fileSizeMB: +(f.size / (1024 * 1024)).toFixed(2),
      type: 'question_paper',
    }));

    await SourceDocument.insertMany([...materialDocs, ...qpDocs]);

    // Fire-and-forget: don't block the HTTP response on the full pipeline
    runPipeline(project._id).catch((err) =>
      console.error('[Pipeline] Unhandled error:', err)
    );

    res.status(201).json({ projectId: project._id });
  } catch (err) {
    console.error('[uploadProject]', err);
    res.status(500).json({ error: 'Failed to start processing. Please try again.' });
  }
}

/**
 * GET /api/projects/:id/status
 * Polled by the frontend processing screen.
 */
async function getStatus(req, res) {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    res.json({
      status: project.status,
      progress: project.progress,
      stats: project.status === 'ready' ? project.stats : null,
      errorMessage: project.errorMessage,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
}

/**
 * GET /api/projects/:id/results
 * Returns everything the results.html page needs in one call:
 * notes, conflicts, stats, study material.
 */
async function getResults(req, res) {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (project.status !== 'ready') {
      return res.status(409).json({ error: 'Project is not ready yet', status: project.status });
    }

    const [notes, conflicts, studyMaterial] = await Promise.all([
      UnifiedNote.find({ projectId: project._id }).sort('order'),
      Conflict.find({ projectId: project._id }),
      StudyMaterial.findOne({ projectId: project._id }),
    ]);

    res.json({
      project: {
        id: project._id,
        stats: project.stats,
        hasQuestionPapers: project.hasQuestionPapers,
        studyMaterialStatus: project.studyMaterialStatus,
        createdAt: project.createdAt,
      },
      notes,
      conflicts,
      flashcards: studyMaterial?.flashcards || [],
      quiz: studyMaterial?.quiz || { mcq: [], short: [], long: [] },
      revision: studyMaterial?.revision || [],
    });
  } catch (err) {
    console.error('[getResults]', err);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
}

/**
 * GET /api/projects/:id/study-material-status
 * Polled by results.html while flashcards/quiz/revision are still
 * generating in the background, after notes are already visible.
 */
async function getStudyMaterialStatus(req, res) {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (project.studyMaterialStatus !== 'ready') {
      return res.json({ studyMaterialStatus: project.studyMaterialStatus });
    }

    const studyMaterial = await StudyMaterial.findOne({ projectId: project._id });
    res.json({
      studyMaterialStatus: 'ready',
      flashcards: studyMaterial?.flashcards || [],
      quiz: studyMaterial?.quiz || { mcq: [], short: [], long: [] },
      revision: studyMaterial?.revision || [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch study material status' });
  }
}

/**
 * POST /api/projects/:id/question-papers
 * Accepts multipart form-data:
 *   - questionPapers: PDF[] - required, min 1
 * For an EXISTING, already-fused project. Saves the PDFs, kicks off
 * extraction/chunking/embedding/exam-analysis asynchronously, and
 * responds immediately so the frontend can poll qp-status.
 */
async function uploadQuestionPapers(req, res) {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (project.status !== 'ready') {
      return res.status(409).json({ error: 'This project has not finished processing its main notes yet.' });
    }

    const qpFiles = req.files?.questionPapers || [];
    if (qpFiles.length === 0) {
      return res.status(400).json({ error: 'Please upload at least 1 question paper PDF.' });
    }

    const qpDocsData = qpFiles.map((f) => ({
      projectId: project._id,
      fileName: f.originalname,
      filePath: f.path,
      fileSizeMB: +(f.size / (1024 * 1024)).toFixed(2),
      type: 'question_paper',
    }));

    const qpDocs = await SourceDocument.insertMany(qpDocsData);

    // Fire-and-forget: extraction + embedding + exam analysis can take a
    // while, so the frontend polls GET /:id/qp-status instead of waiting.
    processQuestionPapers(project._id, qpDocs).catch((err) =>
      console.error('[QP Pipeline] Unhandled error:', err)
    );

    res.status(202).json({ message: 'Question papers received, analysis started.' });
  } catch (err) {
    console.error('[uploadQuestionPapers]', err);
    res.status(500).json({ error: 'Failed to upload question papers. Please try again.' });
  }
}

/**
 * GET /api/projects/:id/qp-status
 * Polled by results.html after uploading question papers.
 */
async function getQPStatus(req, res) {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    res.json({
      qpStatus: project.qpStatus,
      qpErrorMessage: project.qpErrorMessage,
      examTopics: project.qpStatus === 'ready' ? project.examTopics : [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch question paper status' });
  }
}

/**
 * GET /api/projects/:id/export/:kind   (kind = notes | revision)
 * Streams a ready-made PDF download.
 */
async function exportPdf(req, res) {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const kind = req.params.kind === 'revision' ? 'revision' : 'notes';
    let doc;
    if (kind === 'notes') {
      const notes = await UnifiedNote.find({ projectId: project._id }).sort('order').lean();
      if (!notes.length) return res.status(404).json({ error: 'No notes to export yet.' });
      doc = buildNotesPdf(notes);
    } else {
      const sm = await StudyMaterial.findOne({ projectId: project._id }).lean();
      if (!sm?.revision?.length) return res.status(404).json({ error: 'No revision sheet to export yet.' });
      doc = buildRevisionPdf(sm.revision);
    }
    res.setHeader('Content-Type', 'application/pdf');
    const disp = req.query.inline ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disp}; filename="DocNexus-${kind === 'notes' ? 'Unified-Notes' : 'Revision-Sheet'}.pdf"`);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    console.error('[exportPdf]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to build PDF' });
  }
}

module.exports = { uploadProject, getStatus, getResults, uploadQuestionPapers, getQPStatus, getStudyMaterialStatus, exportPdf };