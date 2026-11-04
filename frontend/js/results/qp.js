// ─────────────────────────────────────────────
//  DocNexus — Results Page: Question Papers
//  Upload + status polling + exam-topic-frequency
//  rendering. Depends on globals from core.js
//  (API_BASE, projectId, escapeHtml).
// ─────────────────────────────────────────────

let qpOpen = false;
let qpSelectedFiles = []; // real File objects queued for upload
let qpPollTimer = null;

function toggleQPPanel(forceOpen = false) {
  qpOpen = forceOpen ? true : !qpOpen;
  const panel = document.getElementById('qpPanel');
  const chevron = document.getElementById('qpChevron');
  panel.classList.toggle('hidden', !qpOpen);
  chevron.style.transform = qpOpen ? 'rotate(180deg)' : 'rotate(0deg)';
}

function handleResultQPDrop(e) {
  e.preventDefault();
  document.getElementById('qpUploadArea').classList.remove('border-[#a78bfa]/50');
  handleResultQPFiles(e.dataTransfer.files);
}

function handleResultQPFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const uploadArea = document.getElementById('qpUploadArea');
  const filesArea = document.getElementById('qpResultFiles');
  const listEl = document.getElementById('qpResultFileList');

  uploadArea.classList.add('hidden');
  filesArea.classList.remove('hidden');
  listEl.innerHTML = '';
  qpSelectedFiles = [];

  Array.from(fileList).forEach(file => {
    if (!file.name.toLowerCase().endsWith('.pdf')) return;
    qpSelectedFiles.push(file);

    const sizeMB = (file.size / 1048576).toFixed(1);
    const card = document.createElement('div');
    card.className = 'flex items-center gap-3 p-3 bg-[#a78bfa]/5 border border-[#a78bfa]/15 rounded-xl';
    card.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-[#a78bfa]/10 flex items-center justify-center shrink-0">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-[12px] font-medium text-zinc-300 truncate">${escapeHtml(file.name)}</div>
        <div class="text-[10px] text-zinc-600">${sizeMB} MB</div>
      </div>
      <span class="text-[10px] text-zinc-400 bg-white/5 px-2 py-1 rounded-md qp-file-status">Queued</span>
    `;
    listEl.appendChild(card);
  });

  uploadQuestionPapers();
}

async function uploadQuestionPapers() {
  if (!projectId || qpSelectedFiles.length === 0) return;

  setQPStatusBanner('Uploading and analysing your question papers...');

  try {
    const formData = new FormData();
    qpSelectedFiles.forEach(f => formData.append('questionPapers', f));

    const res = await fetch(`${API_BASE}/${projectId}/question-papers`, { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Upload failed');
    }

    document.querySelectorAll('.qp-file-status').forEach(el => {
      el.textContent = 'Processing';
      el.className = 'text-[10px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md qp-file-status';
    });

    pollQPStatus();
  } catch (err) {
    console.error('[uploadQuestionPapers]', err);
    setQPStatusBanner(`Upload failed: ${err.message}`, true);
  }
}

function setQPStatusBanner(text, isError = false) {
  let banner = document.getElementById('qpStatusBanner');
  const filesArea = document.getElementById('qpResultFiles');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'qpStatusBanner';
    banner.className = 'text-[12px] mb-3';
    filesArea.insertBefore(banner, filesArea.firstChild);
  }
  banner.textContent = text;
  banner.className = `text-[12px] mb-3 ${isError ? 'text-red-400' : 'text-[#a78bfa]'}`;
}

async function pollQPStatus() {
  if (qpPollTimer) clearTimeout(qpPollTimer);
  try {
    const res = await fetch(`${API_BASE}/${projectId}/qp-status`);
    if (!res.ok) throw new Error('status check failed');
    const data = await res.json();

    if (data.qpStatus === 'ready') {
      document.querySelectorAll('.qp-file-status').forEach(el => {
        el.textContent = 'Processed';
        el.className = 'text-[10px] text-[#34d399] bg-[#34d399]/10 px-2 py-1 rounded-md qp-file-status';
      });
      setQPStatusBanner('Analysis complete.');
      renderExamTopics(data.examTopics || []);

      const lbl = document.getElementById('chatSourceLabel');
      if (lbl) lbl.textContent = 'Answering from fused notes + exam papers';
      return;
    }

    if (data.qpStatus === 'failed') {
      setQPStatusBanner(data.qpErrorMessage || 'Analysis failed.', true);
      return;
    }

    qpPollTimer = setTimeout(pollQPStatus, 2000);
  } catch (err) {
    console.error('[pollQPStatus]', err);
    qpPollTimer = setTimeout(pollQPStatus, 4000);
  }
}

function checkExistingQPState() {
  // Project already has question papers from a previous visit — open the
  // panel and fetch the cached exam analysis straight away.
  toggleQPPanel(true);
  document.getElementById('qpUploadArea').classList.add('hidden');
  document.getElementById('qpResultFiles').classList.remove('hidden');
  loadExamAnalysisIfAvailable();
}

async function loadExamAnalysisIfAvailable() {
  if (!projectId) return;
  try {
    const res = await fetch(`${API_BASE}/${projectId}/exam-analysis`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.topics && data.topics.length > 0) {
      renderExamTopics(data.topics);
      const lbl = document.getElementById('chatSourceLabel');
      if (lbl) lbl.textContent = 'Answering from fused notes + exam papers';
    }
  } catch (err) {
    console.error('[loadExamAnalysisIfAvailable]', err);
  }
}

function renderExamTopics(topics) {
  const listEl = document.getElementById('qpResultFileList');
  if (!listEl) return;
  const parent = listEl.parentElement;

  let topicsBlock = document.getElementById('examTopicsBlock');
  if (!topicsBlock) {
    topicsBlock = document.createElement('div');
    topicsBlock.id = 'examTopicsBlock';
    topicsBlock.className = 'border-t border-white/5 pt-5 mt-5';
    parent.appendChild(topicsBlock);
  }

  if (!topics || topics.length === 0) {
    topicsBlock.innerHTML = `<div class="text-[12px] text-zinc-600">No clear topic matches found yet.</div>`;
    return;
  }

  const maxCount = Math.max(...topics.map(t => t.count));
  topicsBlock.innerHTML = `
    <div class="text-[11px] text-zinc-600 uppercase tracking-widest font-bold mb-3">Most Asked Topics</div>
    <div class="space-y-2">
      ${topics.slice(0, 8).map((t, i) => `
        <div class="flex items-center gap-3">
          <div class="text-[12px] text-zinc-400 w-4 font-bold">${i + 1}</div>
          <div class="flex-1 text-[13px] text-zinc-300">${escapeHtml(t.topic)}${(t.papers || []).length ? `<div class="text-[10px] text-zinc-500 mt-0.5">${t.papers.length > 1 ? 'Recurring · ' : ''}${t.papers.map(p => escapeHtml(String(p.year || p.name).replace(/\.pdf$/i, '')) + (p.count > 1 ? ' ×' + p.count : '')).join(' · ')}</div>` : ''}</div>
          <div class="text-[11px] text-[#a78bfa] font-bold">${t.count}×</div>
          <div class="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div class="h-full bg-[#a78bfa] rounded-full" style="width:${Math.round((t.count / maxCount) * 100)}%"></div>
          </div>
        </div>
      `).join('')}
    </div>`;
}