// backend/services/pipelineService.js
// ─────────────────────────────────────────────
//  Orchestrates the full pipeline for one project:
//  Extract → Chunk → Embed → Fuse → Generate study material
//  Updates Project.progress at each stage so the
//  frontend can poll and show a real progress bar.
// ─────────────────────────────────────────────

const Project = require('../models/Project');
const SourceDocument = require('../models/SourceDocument');
const Chunk = require('../models/Chunk');
const QPChunk = require('../models/QPChunk');
const UnifiedNote = require('../models/UnifiedNote');
const Conflict = require('../models/Conflict');
const StudyMaterial = require('../models/StudyMaterial');

const { extractTextFromPDF } = require('./pdfService');
const { chunkPages } = require('./chunkService');
const { embedBatch } = require('./embeddingService');
const { runFusion } = require('./fusionEngine');
const { generateAllStudyMaterial } = require('./studyMaterialService');
const { analyzeTopicFrequency } = require('./examAnalysisService');

async function setProgress(projectId, step, pct) {
  await Project.findByIdAndUpdate(projectId, { 'progress.step': step, 'progress.pct': pct });
}

/**
 * Extract + chunk + embed a set of question-paper SourceDocuments, store
 * the results in QPChunk, then run exam topic-frequency analysis and
 * cache it on the Project. Manages Project.qpStatus throughout so the
 * frontend can poll it the same way it polls the main pipeline.
 *
 * Used both by the main pipeline (if QPs happen to be uploaded alongside
 * the initial material) and by the standalone "add question papers
 * later" endpoint used from results.html.
 *
 * @param {string} projectId
 * @param {Array<SourceDocument>} qpDocs
 */
async function processQuestionPapers(projectId, qpDocs) {
  try {
    await Project.findByIdAndUpdate(projectId, { qpStatus: 'processing', qpErrorMessage: null });

    for (const doc of qpDocs) {
      const { text, pages, pageCount } = await extractTextFromPDF(doc.filePath);
      doc.rawText = text;
      doc.pageCount = pageCount;
      doc.status = 'extracted';
      await doc.save();

      const chunked = await chunkPages(pages.length ? pages : [text]);
      const qpEmbeddings = await embedBatch(chunked.map((c) => c.text));

      await QPChunk.insertMany(
        chunked.map((c, i) => ({
          projectId,
          sourceDocumentId: doc._id,
          sourceFileName: doc.fileName,
          text: c.text,
          embedding: qpEmbeddings[i],
        }))
      );
    }

    // Run exam topic-frequency analysis against ALL question papers the
    // project has so far (not just the ones just uploaded), then cache it.
    const allQpChunks = await QPChunk.find({ projectId }).limit(300);
    const notes = await UnifiedNote.find({ projectId });
    const knownTopics = notes.map((n) => n.title);

    let examTopics = [];
    if (allQpChunks.length > 0 && knownTopics.length > 0) {
      examTopics = await analyzeTopicFrequency(allQpChunks.map((c) => c.text), knownTopics);
    }

    await Project.findByIdAndUpdate(projectId, {
      hasQuestionPapers: true,
      qpStatus: 'ready',
      examTopics,
    });
  } catch (err) {
    console.error(`[QP Pipeline] Project ${projectId} failed:`, err);
    await Project.findByIdAndUpdate(projectId, {
      qpStatus: 'failed',
      qpErrorMessage: err.message,
    });
  }
}

/**
 * Runs the entire pipeline for a project. Intended to be called
 * asynchronously (fire-and-forget) right after upload, with the
 * frontend polling GET /api/projects/:id/status for progress.
 */
async function runPipeline(projectId) {
  try {
    await Project.findByIdAndUpdate(projectId, { status: 'processing' });

    // ── Phase 2 & 3: Extract + Chunk (per source document) ──
    await setProgress(projectId, 'extract', 10);
    const materialDocs = await SourceDocument.find({ projectId, type: 'material' });

    const allChunkRecords = []; // { text, pageNumber, sourceFileName, sourceDocumentId }

    for (const doc of materialDocs) {
      const { text, pages, pageCount } = await extractTextFromPDF(doc.filePath);
      doc.rawText = text;
      doc.pageCount = pageCount;
      doc.status = 'extracted';
      await doc.save();

      const chunked = await chunkPages(pages.length ? pages : [text]);
      chunked.forEach((c) => {
        allChunkRecords.push({
          text: c.text,
          pageNumber: c.pageNumber,
          sourceFileName: doc.fileName,
          sourceDocumentId: doc._id,
        });
      });
    }

    // Chunking has no user-facing meaning of its own, so we fold it into
    // the same "understand" stage as embeddings rather than giving it a
    // separate step label.
    await setProgress(projectId, 'understand', 30);

    // ── Phase 4: Embeddings ──
    const embeddings = await embedBatch(allChunkRecords.map((c) => c.text));
    await setProgress(projectId, 'understand', 50);

    const chunkDocs = await Chunk.insertMany(
      allChunkRecords.map((c, i) => ({
        projectId,
        sourceDocumentId: c.sourceDocumentId,
        sourceFileName: c.sourceFileName,
        pageNumber: c.pageNumber,
        text: c.text,
        embedding: embeddings[i],
      }))
    );

    // ── Phase 5: Knowledge Fusion Engine ──
    await setProgress(projectId, 'match', 65);
    const { notes, conflicts, duplicatesRemoved, sourcesUsed } = await runFusion(
      chunkDocs.map((c) => ({
        _id: c._id,
        text: c.text,
        embedding: c.embedding,
        sourceFileName: c.sourceFileName,
        pageNumber: c.pageNumber,
      }))
    );
    await setProgress(projectId, 'conflict', 75);

    // ── Phase 6 & 8: Save Unified Notes + Conflicts ──
    const savedConflicts = await Conflict.insertMany(
      conflicts.map((c) => ({ projectId, ...c }))
    );

    // Map conflict topic -> conflict _id so notes can link to them
    const conflictByTopic = {};
    savedConflicts.forEach((c) => {
      conflictByTopic[c.topic] = c._id;
    });

    const savedNotes = await UnifiedNote.insertMany(
      notes.map((n, idx) => ({
        projectId,
        title: n.title,
        content: n.content,
        sources: n.sources,
        hasConflict: n.hasConflict,
        conflictId: n.hasConflict ? conflictByTopic[n.title] || null : null,
        order: idx,
      }))
    );

    await setProgress(projectId, 'fuse', 85);

    // ── Phase 7: Question Papers (optional) ──
    const qpDocs = await SourceDocument.find({ projectId, type: 'question_paper' });
    if (qpDocs.length > 0) {
      await processQuestionPapers(projectId, qpDocs);
    }

    // ── Generate flashcards / quiz / revision / interview prep ──
    await setProgress(projectId, 'studymaterial', 92);
    const studyMaterial = await generateAllStudyMaterial(savedNotes);
    await StudyMaterial.create({ projectId, ...studyMaterial });

    // ── Done ──
    await Project.findByIdAndUpdate(projectId, {
      status: 'ready',
      'progress.step': 'done',
      'progress.pct': 100,
      hasQuestionPapers: qpDocs.length > 0,
      stats: {
        topicsMerged: savedNotes.length,
        duplicatesRemoved,
        conflictsFound: savedConflicts.length,
        sourcesUsed,
      },
    });
  } catch (err) {
    console.error(`[Pipeline] Project ${projectId} failed:`, err);
    await Project.findByIdAndUpdate(projectId, {
      status: 'failed',
      errorMessage: err.message,
    });
  }
}

module.exports = { runPipeline, processQuestionPapers };