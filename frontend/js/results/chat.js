// ─────────────────────────────────────────────
//  DocNexus — Results Page: Chat
//  RAG chatbot UI + backend calls. Depends on
//  globals from core.js (API_BASE, projectId,
//  escapeHtml).
// ─────────────────────────────────────────────

let chatBusy = false;

function setChatBusy(busy) {
  chatBusy = busy;
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  if (input) input.disabled = busy;
  if (sendBtn) sendBtn.disabled = busy;
  document.querySelectorAll('#chatSuggestions button').forEach(b => { b.disabled = busy; });
}

function sendSuggestion(btn) {
  if (chatBusy) return;
  const text = btn.textContent.trim();
  const suggestions = document.getElementById('chatSuggestions');
  if (suggestions) suggestions.classList.add('hidden');
  appendUserMessage(text);
  askBackend(text);
}

function sendChat() {
  if (chatBusy) return;
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const suggestions = document.getElementById('chatSuggestions');
  if (suggestions) suggestions.classList.add('hidden');

  appendUserMessage(text);
  askBackend(text);
}

async function askBackend(question) {
  setChatBusy(true);
  showTypingIndicator();
  try {
    const res = await fetch(`${API_BASE}/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, includeQuestionPapers: true }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to get an answer');
    }
    const data = await res.json();
    removeTypingIndicator();
    appendBotMessage(escapeHtml(data.answer).replace(/\n/g, '<br>'), data.sources || []);
  } catch (err) {
    console.error('[askBackend]', err);
    removeTypingIndicator();
    appendBotMessage(`Sorry, I couldn't get an answer: ${escapeHtml(err.message)}`, []);
  } finally {
    setChatBusy(false);
    const input = document.getElementById('chatInput');
    if (input) input.focus();
  }
}

function appendUserMessage(text) {
  const messages = document.getElementById('chatMessages');
  const el = document.createElement('div');
  el.className = 'flex justify-end animate-slide-right';
  el.innerHTML = `
    <div class="bg-[#7c6fff]/20 border border-[#7c6fff]/20 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]">
      <p class="text-[13px] text-zinc-200">${escapeHtml(text)}</p>
    </div>`;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function showTypingIndicator() {
  const messages = document.getElementById('chatMessages');
  const el = document.createElement('div');
  el.className = 'flex gap-3 animate-fade-in';
  el.id = 'typingIndicator';
  el.innerHTML = `
    <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c6fff] to-[#a78bfa] flex items-center justify-center shrink-0 mt-0.5">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    </div>
    <div class="bg-white/[0.04] rounded-2xl rounded-tl-sm px-4 py-3">
      <div class="flex gap-1 items-center h-4">
        <div class="typing-dot w-1.5 h-1.5 rounded-full bg-zinc-500"></div>
        <div class="typing-dot w-1.5 h-1.5 rounded-full bg-zinc-500"></div>
        <div class="typing-dot w-1.5 h-1.5 rounded-full bg-zinc-500"></div>
      </div>
    </div>`;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function appendBotMessage(html, sources = []) {
  const messages = document.getElementById('chatMessages');
  const el = document.createElement('div');
  el.className = 'flex gap-3 animate-slide-right';
  el.innerHTML = `
    <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c6fff] to-[#a78bfa] flex items-center justify-center shrink-0 mt-0.5">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    </div>
    <div class="bg-white/[0.04] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[82%]">
      <p class="text-[13px] text-zinc-300 leading-relaxed">${html}</p>
      ${sources.length ? `
        <div class="mt-2 flex flex-wrap gap-1">
          ${sources.map(s => `<span class="text-[10px] px-2 py-0.5 rounded-md bg-[#7c6fff]/10 border border-[#7c6fff]/20 text-[#a78bfa]">${escapeHtml(s)}</span>`).join('')}
        </div>` : ''}
    </div>`;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

// ─────────────────────────────────────────────
//  Suggestions built from the user's OWN notes (+ exam stats once papers exist)
// ─────────────────────────────────────────────
const GENERIC_CHAT_TITLE = /review questions|topics? for discussion|summary|bibliograph|references|chapter outline|more figures|^m4 notes|contains only/i;
let chatHasPapers = false;

function refreshChatSuggestions() {
  const box = document.getElementById('chatSuggestions');
  if (!box || typeof NOTES === 'undefined' || !NOTES.length) return false;
  const titles = NOTES.map(n => n.title).filter(t => t && t.length < 60 && !GENERIC_CHAT_TITLE.test(t));
  const pick = (i) => titles[Math.floor((i * titles.length) / 3)];
  const list = [];
  if (titles.length) list.push(`Summarize "${pick(0)}"`);
  if (titles.length > 3) list.push(`Explain "${pick(1)}"`);
  list.push('Summarize the 1st topic');
  if (typeof CONFLICTS !== 'undefined' && CONFLICTS.length) list.push('What are the conflicts?');
  if (chatHasPapers) { list.push('Which topics are asked most often?'); list.push('Which topics were asked last year?'); }
  else list.push('List all the topics');
  box.innerHTML = list.slice(0, 5).map(t =>
    `<button onclick="sendSuggestion(this)" class="text-[11px] px-3 py-1.5 rounded-xl border border-white/10 text-zinc-400 hover:border-[#7c6fff]/40 hover:text-[#a78bfa] transition-all disabled:opacity-30 disabled:cursor-not-allowed">${escapeHtml(t)}</button>`
  ).join('');
  box.classList.remove('hidden');
  return true;
}

// Question papers are optional and can be added right from the chat
function attachQPFromChat(input) {
  const files = Array.from(input.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf'));
  if (!files.length) return;
  appendBotMessage(`Got ${files.length} question paper${files.length > 1 ? 's' : ''} (${escapeHtml(files.map(f => f.name).join(', '))}). Analysing which topics were asked and when…`, []);
  const dt = new DataTransfer();
  files.forEach(f => dt.items.add(f));
  handleResultQPFiles(dt.files); // same upload + polling as the question-paper panel
  input.value = '';
  watchQPForChat();
}

let qpChatTimer = null;
function watchQPForChat() {
  if (qpChatTimer) clearInterval(qpChatTimer);
  qpChatTimer = setInterval(async () => {
    try {
      const r = await fetch(`${API_BASE}/${projectId}/qp-status`);
      const d = await r.json();
      if (d.qpStatus === 'ready') {
        clearInterval(qpChatTimer);
        chatHasPapers = true;
        const top = (d.examTopics || []).slice(0, 3).map(t => t.topic);
        appendBotMessage(top.length
          ? `Done. Most-asked so far: ${escapeHtml(top.join(', '))}. Ask me "which topics were asked last year?" or "was ${escapeHtml(top[0])} asked before?".`
          : 'Done, but I could not match the questions to your topics. You can still ask about the papers.', []);
        refreshChatSuggestions();
      } else if (d.qpStatus === 'failed') {
        clearInterval(qpChatTimer);
        appendBotMessage(`Could not analyse the papers: ${escapeHtml(d.qpErrorMessage || 'unknown error')}`, []);
      }
    } catch (e) { /* keep polling */ }
  }, 2500);
}

(function initChatSuggestions() {
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (typeof NOTES !== 'undefined' && NOTES.length) {
      fetch(`${API_BASE}/${projectId}/qp-status`).then(r => r.json()).then(d => { chatHasPapers = d.qpStatus === 'ready'; refreshChatSuggestions(); }).catch(refreshChatSuggestions);
      clearInterval(t);
    } else if (tries > 40) clearInterval(t);
  }, 500);
})();
