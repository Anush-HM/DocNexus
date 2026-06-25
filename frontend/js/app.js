// ─────────────────────────────────────────────
//  DocNexus — Upload Page JS
// ─────────────────────────────────────────────

const getFileNames = () =>
  Array.from(document.querySelectorAll('#fileList .file-card')).map(c => c.dataset.name);

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
  btn.closest('.file-card').remove();
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
const STEPS = [
  { id: 'extract',  label: 'Extracting text from PDFs',      icon: '📄', pct: 15  },
  { id: 'chunk',    label: 'Chunking documents',              icon: '✂️',  pct: 30  },
  { id: 'embed',    label: 'Generating embeddings',           icon: '🔢', pct: 50  },
  { id: 'match',    label: 'Matching topics across sources',  icon: '🔗', pct: 65  },
  { id: 'dedupe',   label: 'Removing duplicates',             icon: '🧹', pct: 78  },
  { id: 'conflict', label: 'Detecting conflicts',             icon: '⚠️',  pct: 88  },
  { id: 'fuse',     label: 'Fusing knowledge base',           icon: '⚡', pct: 96  },
  { id: 'done',     label: 'Finalising notes',                icon: '✅', pct: 100 },
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

function startFusion() {
  const fileCount = document.querySelectorAll('#fileList .file-card').length;
  if (fileCount < 2) return;
  const topic = document.getElementById('topicInput').value.trim();
  if (topic) sessionStorage.setItem('docnexus_topic', topic);

  // Switch screens
  document.getElementById('uploadScreen').className = 'screen-hidden';
  document.getElementById('processingScreen').className = 'screen-shown min-h-[85vh] flex flex-col items-center justify-center px-6 py-16';

  buildStepsList();
  let i = 0;
  function runStep() {
    if (i >= STEPS.length) { setTimeout(() => { window.location.href = 'results.html'; }, 700); return; }
    const s = STEPS[i], prev = STEPS[i - 1];
    if (prev) activateStep(prev.id, true);
    activateStep(s.id);
    setProgress(s.pct, s.label);
    if (s.id === 'embed')    animateCounter('liveChunks', 284);
    if (s.id === 'dedupe')   animateCounter('liveDupes', 137);
    if (s.id === 'conflict') animateCounter('liveConflicts', 3);
    i++;
    setTimeout(runStep, s.id === 'done' ? 1200 : 900 + Math.random() * 400);
  }
  setTimeout(runStep, 400);
}

document.addEventListener('DOMContentLoaded', updateStats);