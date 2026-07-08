// ─────────────────────────────────────────────
//  DocNexus — Results Page: Core
//  Shared state, page init, stats, tabs,
//  Notes + Conflicts rendering, shared helpers.
//  Loaded first; other result/*.js modules depend
//  on the globals declared here.
// ─────────────────────────────────────────────

const API_BASE = 'http://localhost:5000/api/projects';
const SERVER_ROOT = 'http://localhost:5000'; // for static files served outside /api, e.g. /page-images

const projectId = sessionStorage.getItem('docnexus_project_id');

// Shared in-memory state, populated from the backend after fetch.
// Other modules (qp.js, chat.js, study.js) read from these.
let NOTES = [];
let CONFLICTS = [];
let FLASHCARDS = [];
let QUIZ = { mcq: [], short: [], long: [] };
let REVISION = [];

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadTopicBadge();

  if (!projectId) {
    showNoProjectState();
    return;
  }

  showLoadingState();
  loadResults();
});

function showLoadingState() {
  const skeleton = `<div class="text-center py-12 text-zinc-600 text-sm flex items-center justify-center gap-2">
    <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
    Loading...
  </div>`;
  ['notesSections', 'conflictsList', 'quizQuestions', 'revisionContent'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = skeleton;
  });
}

function showGlobalError(message, options = {}) {
  const { allowRetry = true, projectStatus = null } = options;

  let actionHtml = '';
  if (projectStatus === 'processing' || projectStatus === 'uploading') {
    actionHtml = `<div class="text-zinc-500 text-xs mt-2">Your documents are still being processed.</div>
      <a href="index.html" class="inline-block mt-3 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] text-white text-xs font-bold">Return to upload</a>`;
  } else if (allowRetry) {
    actionHtml = `<button onclick="retryLoadResults()" class="inline-block mt-3 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] text-white text-xs font-bold">Try again</button>`;
  }

  const errorBlock = `<div class="text-center py-12">
    <div class="text-zinc-400 text-sm mb-1">${escapeHtml(message)}</div>
    ${actionHtml}
  </div>`;

  ['notesSections', 'conflictsList', 'quizQuestions', 'revisionContent'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = errorBlock;
  });

  // Flashcards tab has a fixed card layout rather than a list container,
  // so it needs its own simple message instead of replacing structure.
  const cardQ = document.getElementById('cardQ');
  const cardA = document.getElementById('cardA');
  if (cardQ) cardQ.textContent = 'Unable to load';
  if (cardA) cardA.textContent = message;
}

function retryLoadResults() {
  showLoadingState();
  loadResults();
}

function showNoProjectState() {
  const main = document.querySelector('.max-w-\\[900px\\]');
  if (main) {
    main.innerHTML = `
      <div class="text-center py-24">
        <div class="text-zinc-400 text-sm mb-4">No active project found. Please upload your documents first.</div>
        <a href="index.html" class="inline-block px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] text-white text-sm font-bold">Go to Upload</a>
      </div>`;
  }
}

function loadTopicBadge() {
  const topic = sessionStorage.getItem('docnexus_topic');
  if (topic) {
    const badge = document.getElementById('topicBadge');
    badge.textContent = topic;
    badge.classList.remove('hidden');
  }
}

async function loadResults() {
  try {
    const res = await fetch(`${API_BASE}/${projectId}/results`);

    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      showGlobalError(
        'This project is still being processed.',
        { allowRetry: false, projectStatus: body.status }
      );
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load results');
    }

    const data = await res.json();

    NOTES = data.notes || [];
    CONFLICTS = data.conflicts || [];
    FLASHCARDS = data.flashcards || [];
    QUIZ = data.quiz || { mcq: [], short: [], long: [] };
    REVISION = data.revision || [];

    renderStats(data.project);
    renderNotes();
    renderConflicts();
    renderFlashcards();
    renderQuiz('mcq');
    renderRevision();

    if (data.project?.hasQuestionPapers) {
      checkExistingQPState();
    }
  } catch (err) {
    console.error('[loadResults]', err);
    showGlobalError(`Couldn't load your results: ${err.message}`);
  }
}

function renderStats(project) {
  if (!project) return;
  const stats = project.stats || {};
  const elTopics = document.getElementById('statTopics');
  const elDupes = document.getElementById('statDupes');
  const elConflicts = document.getElementById('statConflicts');
  const elSources = document.getElementById('statSources');
  if (elTopics) elTopics.textContent = stats.topicsMerged ?? 0;
  if (elDupes) elDupes.textContent = stats.duplicatesRemoved ?? 0;
  if (elConflicts) elConflicts.textContent = stats.conflictsFound ?? 0;
  if (elSources) elSources.textContent = stats.sourcesUsed ?? 0;

  const notesSubtitle = document.getElementById('notesSubtitle');
  if (notesSubtitle) {
    notesSubtitle.textContent = `${stats.topicsMerged ?? 0} topics · ${stats.sourcesUsed ?? 0} sources`;
  }
}

// ─────────────────────────────────────────────
//  TABS
// ─────────────────────────────────────────────

function switchTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  btn.classList.add('active');

  if (name !== 'flashcards') {
    const wrap = document.getElementById('flashcardWrap');
    if (wrap) wrap.classList.remove('flipped');
  }
}

function switchTabById(name) {
  const btn = document.querySelector(`[onclick="switchTab('${name}', this)"]`);
  if (btn) switchTab(name, btn);
}

// ─────────────────────────────────────────────
//  NOTES
// ─────────────────────────────────────────────

function renderNotes() {
  const container = document.getElementById('notesSections');
  if (NOTES.length === 0) {
    container.innerHTML = `<div class="text-center py-12 text-zinc-500 text-sm">No notes yet.</div>`;
    return;
  }
  container.innerHTML = NOTES.map(note => `
    <div class="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 notes-content">
      <div class="flex items-start justify-between gap-3 mb-3">
        <h3 class="!mt-0 !mb-0">${escapeHtml(note.title)}</h3>
        ${note.hasConflict ? `<span class="conflict-inline shrink-0 cursor-pointer" onclick="switchTabById('conflicts')">⚠️ Conflict</span>` : ''}
      </div>
      <p>${escapeHtml(note.content)}</p>
      ${(note.images && note.images.length > 0) ? `
        <div class="flex flex-wrap gap-3 mt-4">
          ${note.images.map(url => `
            <img src="${SERVER_ROOT}${url}" alt="Diagram for ${escapeHtml(note.title)}"
                 class="rounded-lg border border-white/10 max-h-64 object-contain cursor-pointer"
                 onclick="window.open('${SERVER_ROOT}${url}', '_blank')" />
          `).join('')}
        </div>
      ` : ''}
      <div class="flex flex-wrap gap-1 mt-3">
        ${(note.sources || []).map(s => `<span class="source-tag">${escapeHtml(s)}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
//  CONFLICTS
// ─────────────────────────────────────────────

function renderConflicts() {
  const container = document.getElementById('conflictsList');
  const badge = document.getElementById('conflictsTabBadge');
  const subtitle = document.getElementById('conflictsSubtitle');
  const agreeNote = document.getElementById('conflictsAgreeNote');
  const agreeText = document.getElementById('conflictsAgreeText');

  if (badge) badge.textContent = CONFLICTS.length;
  if (subtitle) subtitle.textContent = `${CONFLICTS.length} conflict${CONFLICTS.length === 1 ? '' : 's'} detected across sources`;

  if (CONFLICTS.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-zinc-500 text-sm">No conflicts detected — all sources agree.</div>`;
    if (agreeNote) agreeNote.classList.add('hidden');
    return;
  }

  container.innerHTML = CONFLICTS.map((c) => `
    <div class="conflict-card border border-amber-500/15 bg-amber-500/5 rounded-2xl overflow-hidden cursor-pointer" onclick="this.classList.toggle('expanded')">
      <div class="flex items-center gap-3 p-5">
        <div class="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div class="flex-1">
          <div class="text-[13px] font-semibold text-zinc-200">${escapeHtml(c.topic)}</div>
          <div class="text-[11px] text-zinc-600">${escapeHtml(c.sourceA?.name || '')} vs ${escapeHtml(c.sourceB?.name || '')}</div>
        </div>
        <svg class="conflict-chevron w-4 h-4 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>

      <div class="conflict-body px-5 pb-5 space-y-3 border-t border-amber-500/10">
        <div class="grid md:grid-cols-2 gap-3 mt-3">
          <div class="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04]">
            <div class="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-2">${escapeHtml(c.sourceA?.name || '')}</div>
            <div class="text-[13px] text-zinc-300 leading-relaxed">${escapeHtml(c.sourceA?.claim || '')}</div>
          </div>
          <div class="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04]">
            <div class="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-2">${escapeHtml(c.sourceB?.name || '')}</div>
            <div class="text-[13px] text-zinc-300 leading-relaxed">${escapeHtml(c.sourceB?.claim || '')}</div>
          </div>
        </div>
        <div class="bg-[#34d399]/5 border border-[#34d399]/15 rounded-xl p-4">
          <div class="text-[10px] text-[#34d399] uppercase tracking-widest font-bold mb-1">Recommended</div>
          <div class="text-[13px] text-zinc-300">${escapeHtml(c.recommended || '')}</div>
        </div>
      </div>
    </div>
  `).join('');

  if (agreeNote && agreeText) {
    const agreedCount = Math.max((NOTES.length || 0) - CONFLICTS.length, 0);
    agreeText.textContent = `${agreedCount} topic${agreedCount === 1 ? '' : 's'} had consistent information in all uploaded documents.`;
    agreeNote.classList.remove('hidden');
  }
}

// ─────────────────────────────────────────────
//  EXPORT (browser print-to-PDF)
//  Quick, dependency-free export: opens the browser's
//  native print dialog scoped to just the relevant
//  content, where the user can "Save as PDF". A real
//  server-generated PDF (via pdfkit) can replace this
//  later without changing these two call sites.
// ─────────────────────────────────────────────

function printSection(contentHtml, title) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export as PDF.');
    return;
  }
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(title)} — DocNexus</title>
      <style>
        body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #18181b; padding: 40px; max-width: 720px; margin: 0 auto; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        .meta { color: #71717a; font-size: 12px; margin-bottom: 28px; }
        h3 { font-size: 15px; margin: 20px 0 6px; }
        p { font-size: 13px; line-height: 1.7; color: #3f3f46; margin: 0 0 8px; }
        .tag { display: inline-block; font-size: 10px; padding: 2px 7px; border-radius: 4px; background: #f4f4f5; color: #52525b; margin-right: 4px; margin-top: 4px; }
        ul { padding-left: 18px; margin: 6px 0 16px; }
        li { font-size: 13px; line-height: 1.6; color: #3f3f46; margin-bottom: 4px; }
        .unit { font-weight: 700; font-size: 14px; margin: 18px 0 6px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">Generated by DocNexus · ${new Date().toLocaleDateString()}</div>
      ${contentHtml}
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
}

function exportNotesPDF() {
  if (NOTES.length === 0) {
    alert('No notes to export yet.');
    return;
  }
  const html = NOTES.map(note => `
    <h3>${escapeHtml(note.title)}</h3>
    <p>${escapeHtml(note.content)}</p>
    <div>${(note.sources || []).map(s => `<span class="tag">${escapeHtml(s)}</span>`).join('')}</div>
  `).join('');
  printSection(html, 'Unified Notes');
}

function exportRevisionPDF() {
  if (REVISION.length === 0) {
    alert('No revision sheet to export yet.');
    return;
  }
  const html = REVISION.map(section => `
    <div class="unit">${escapeHtml(section.unit)}</div>
    <ul>${(section.points || []).map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
  `).join('');
  printSection(html, 'Revision Sheet');
}

// ─────────────────────────────────────────────
//  SHARED HELPERS
// ─────────────────────────────────────────────

function escapeHtml(text) {
  if (text == null) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}