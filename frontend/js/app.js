// ─────────────────────────────────────────────
//  DocNexus — Upload Page JS
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  Real file tracking
//  The visual cards in #fileList only show name/size text —
//  they are NOT the actual File objects the browser gave us.
//  We keep the real File objects here, keyed by name, so the
//  upload step later has something real to send.
// ─────────────────────────────────────────────
const selectedFiles = new Map();      // name -> File   (study material PDFs)

const getFileNames = () => Array.from(selectedFiles.keys());

function updateStats() {
  const cards = document.querySelectorAll('#fileList .file-card');
  const count = cards.length;
  const heading  = document.getElementById('uploadHeading');
  const startBtn = document.getElementById('startBtn');
  const warn     = document.getElementById('warnMsg');

  if (heading) {
    heading.classList.toggle('hidden', count === 0);
    if (count > 0) { heading.classList.remove('flex'); heading.classList.add('flex'); }
  }
  document.getElementById('fileCount').textContent = count;

  let totalMB = 0;
  cards.forEach(c => totalMB += parseFloat(c.dataset.size || 0));
  document.getElementById('totalSize').textContent = totalMB.toFixed(1) + ' MB';

  if (startBtn) startBtn.disabled = count < 2;
  if (warn)     warn.classList.toggle('hidden', count >= 2);
}

function removeFile(btn) {
  const card = btn.closest('.file-card');
  const name = card.dataset.name;
  selectedFiles.delete(name);
  card.remove();
  updateStats();
}

function createFileCard(name, sizeMB) {
  const card = document.createElement('div');
  card.className = 'file-card flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl w-full';
  card.dataset.name = name;
  card.dataset.size = sizeMB;
  card.innerHTML = `
    <div class="w-10 h-10 rounded-xl bg-[#7c6fff]/15 flex items-center justify-center shrink-0">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    </div>
    <div class="flex-1 min-w-0">
      <div class="text-[13px] font-medium text-zinc-200 truncate">${name}</div>
      <div class="text-[11px] text-zinc-600">${sizeMB} MB · PDF</div>
    </div>
    <button type="button" class="text-zinc-600 hover:text-red-400 transition-colors p-1" onclick="removeFile(this)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>`;
  return card;
}


function handleFiles(fileList) {
  if (!fileList) return;
  const list = document.getElementById('fileList');
  const addBtn = document.getElementById('addMoreBtn');
  const existingNames = getFileNames();
  Array.from(fileList).forEach(file => {
    if (file.name.toLowerCase().endsWith('.pdf') && !existingNames.includes(file.name)) {
      const sizeMB = (file.size / 1048576).toFixed(1);
      selectedFiles.set(file.name, file); // keep the real File object
      list.insertBefore(createFileCard(file.name, sizeMB), addBtn);
    }
  });
  updateStats();
  document.getElementById('fileInput').value = '';
}


function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('bg-[#7c6fff]/10','border-[#7c6fff]/60');
  handleFiles(e.dataTransfer.files);
}



// ── Processing screen ──
// User-facing stages only. No mention of chunking, embeddings, vectors —
// those are internal mechanics with zero meaning to a student uploading notes.
// Each maps to one (or more) internal backend step keys from Project.progress.step.
const STEPS = [
  { id: 'extract',       label: 'Reading your documents',        icon: '📄', pct: 15  },
  { id: 'understand',    label: 'Understanding the content',     icon: '🧠', pct: 50  },
  { id: 'match',         label: 'Finding overlapping topics',    icon: '🔗', pct: 65  },
  { id: 'conflict',      label: 'Checking for contradictions',   icon: '⚠️',  pct: 78  },
  { id: 'fuse',          label: 'Writing unified notes',         icon: '⚡', pct: 88  },
  { id: 'studymaterial', label: 'Creating flashcards & quizzes',  icon: '🗂️', pct: 96  },
  { id: 'done',          label: 'Finalising',                    icon: '✅', pct: 100 },
];

function buildStepsList() {
  document.getElementById('stepsList').innerHTML = STEPS.map(s => `
    <div id="step-${s.id}" class="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.04] bg-white/[0.02] transition-all duration-300 opacity-30">
      <div class="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-sm shrink-0">${s.icon}</div>
      <div class="text-[13px] text-zinc-400 flex-1">${s.label}</div>
      <div class="step-status w-4 h-4 flex items-center justify-center">
        <div class="w-1.5 h-1.5 rounded-full bg-white/20"></div>
      </div>
    </div>`).join('');
}

function activateStep(stepId, done = false) {
  const el = document.getElementById(`step-${stepId}`);
  if (!el) return;
  if (done) {
    el.classList.remove('opacity-30','border-[#7c6fff]/30','bg-[#7c6fff]/5');
    el.classList.add('opacity-60');
    el.querySelector('.step-status').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else {
    el.classList.remove('opacity-30');
    el.classList.add('border-[#7c6fff]/30','bg-[#7c6fff]/5','opacity-100');
    el.querySelector('.step-status').innerHTML = `<div class="w-2.5 h-2.5 rounded-full bg-[#7c6fff] animate-pulse"></div>`;
  }
}

function setProgress(pct, label) {
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressLabel').textContent = label;
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let val = 0;
  const step = Math.ceil(target / 16);
  const t = setInterval(() => {
    val = Math.min(val + step, target);
    el.textContent = val;
    if (val >= target) clearInterval(t);
  }, 50);
}

// Tracks which step index we've already visually activated, so polling
// (which can land on the same step more than once) doesn't replay animations.
let lastStepIndex = -1;

function applyStep(stepId) {
  const idx = STEPS.findIndex(s => s.id === stepId);
  if (idx === -1 || idx <= lastStepIndex) return;

  // Mark every step between the last one we showed and this one as done,
  // in case polling skips past a fast stage between two checks.
  for (let j = lastStepIndex + 1; j < idx; j++) activateStep(STEPS[j].id, true);

  const prev = STEPS[idx - 1];
  if (prev) activateStep(prev.id, true);
  activateStep(STEPS[idx].id);
  setProgress(STEPS[idx].pct, STEPS[idx].label);
  lastStepIndex = idx;
}

// Same origin when the backend serves the frontend (any deployed host, or localhost:5000);
// only the local dev servers (live-server / http-server / file://) point at localhost:5000.
// Override from the page with: window.DOCNEXUS_API = 'https://your-host/api/projects'
const IS_LOCAL_DEV = !location.protocol.startsWith('http') ||
  (['localhost', '127.0.0.1'].includes(location.hostname) && location.port !== '5000');
const API_BASE = window.DOCNEXUS_API ||
  (IS_LOCAL_DEV ? 'http://localhost:5000/api/projects' : `${location.origin}/api/projects`);
const POLL_INTERVAL_MS = 1500;
let pollFailures = 0;

async function pollStatus(projectId) {
  try {
    const res = await fetch(`${API_BASE}/${projectId}/status`);
    if (!res.ok) throw new Error('status check failed');
    const data = await res.json();
    pollFailures = 0;

    if (data.progress?.step) applyStep(data.progress.step);

    if (data.status === 'ready') {
      activateStep('done', true);
      setProgress(100, 'Done!');
      if (data.stats) {
        animateCounter('liveDupes', data.stats.duplicatesRemoved ?? 0);
        animateCounter('liveConflicts', data.stats.conflictsFound ?? 0);
      }
      sessionStorage.setItem('docnexus_project_id', projectId);
      setTimeout(() => { window.location.href = 'results.html'; }, 900);
      return;
    }

    if (data.status === 'failed') {
      setProgress(STEPS[Math.max(lastStepIndex, 0)]?.pct || 0, 'Something went wrong. Please try again.');
      return; // stop polling
    }

    setTimeout(() => pollStatus(projectId), POLL_INTERVAL_MS);
  } catch (err) {
    console.error('[pollStatus]', err);
    pollFailures++;
    setProgress(
      STEPS[Math.max(lastStepIndex, 0)]?.pct || 0,
      pollFailures >= 4
        ? "Can't reach the backend (is `npm run dev` running in the backend folder?). Retrying..."
        : 'Connection lost. Retrying...'
    );
    setTimeout(() => pollStatus(projectId), POLL_INTERVAL_MS * 2);
  }
}

async function startFusion() {
  const fileCards = document.querySelectorAll('#fileList .file-card');
  if (fileCards.length < 2) return;
  const topic = document.getElementById('topicInput').value.trim();
  if (topic) sessionStorage.setItem('docnexus_topic', topic);

  // Switch screens
  document.getElementById('uploadScreen').className = 'screen-hidden';
  document.getElementById('processingScreen').className = 'screen-shown min-h-[85vh] flex flex-col items-center justify-center px-6 py-16';

  buildStepsList();
  setProgress(5, STEPS[0].label);

  try {
    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('files', file));

    const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Upload failed');
    }
    const { projectId } = await res.json();

    pollStatus(projectId);
  } catch (err) {
    console.error('[startFusion]', err);
    const unreachable = err instanceof TypeError; // fetch could not reach the server at all
    setProgress(
      0,
      unreachable
        ? 'Cannot reach the backend (is it running on port 5000?)'
        : `Upload failed: ${err.message}`
    );
  }
}

document.addEventListener('DOMContentLoaded', updateStats);