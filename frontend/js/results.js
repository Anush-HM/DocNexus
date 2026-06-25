// ─────────────────────────────────────────────
//  DocNexus — Results Page JS
// ─────────────────────────────────────────────

// ── Mock data ──
const MOCK_NOTES = [
  {
    title: 'Deadlock',
    content: 'A deadlock is a situation where a group of processes are blocked because each process is holding a resource and waiting for another resource held by some other process in the group. The system cannot make progress without external intervention.',
    sources: ['OS Textbook.pdf', 'Class Notes.pdf', 'Reference Book.pdf'],
    hasConflict: false,
  },
  {
    title: 'Deadlock Conditions',
    content: 'Four necessary conditions must hold simultaneously for a deadlock to occur: (1) Mutual Exclusion — only one process can use a resource at a time; (2) Hold and Wait — a process holds at least one resource while waiting for others; (3) No Preemption — resources cannot be forcibly taken; (4) Circular Wait — a circular chain of processes each waiting for the next.',
    sources: ['OS Textbook.pdf', 'Class Notes.pdf'],
    hasConflict: false,
  },
  {
    title: 'TCP Handshake',
    content: 'TCP establishes a connection using a handshake process. The standard process involves an exchange of synchronisation and acknowledgement packets before data can be sent.',
    sources: ['Networks Book.pdf', 'Reference Notes.pdf'],
    hasConflict: true,
    conflictId: 0,
  },
  {
    title: 'CPU Scheduling',
    content: 'CPU scheduling is the process of determining which process in the ready queue is allocated the CPU. Common algorithms include FCFS (First Come First Serve), SJF (Shortest Job First), Round Robin, and Priority Scheduling. Each has trade-offs between throughput, turnaround time, and fairness.',
    sources: ['OS Textbook.pdf', 'Class Notes.pdf', 'Reference Book.pdf'],
    hasConflict: false,
  },
  {
    title: 'Paging',
    content: 'Paging is a memory management scheme that eliminates the need for contiguous allocation of physical memory. The logical address space of a process can be non-contiguous, and memory is divided into fixed-size blocks called frames (physical) and pages (logical). A page table maps logical pages to physical frames.',
    sources: ['OS Textbook.pdf', 'Reference Book.pdf'],
    hasConflict: false,
  },
];

const MOCK_CONFLICTS = [
  {
    topic: 'TCP Handshake',
    sourceA: { name: 'Networks Book.pdf', claim: 'TCP uses a 3-way handshake: SYN → SYN-ACK → ACK. This is the standard connection establishment process.' },
    sourceB: { name: 'Reference Notes.pdf', claim: 'TCP connection involves a 4-way handshake: SYN → SYN-ACK → ACK → DATA-ACK during the setup phase.' },
    recommended: 'Networks Book.pdf — The 3-way handshake (SYN, SYN-ACK, ACK) is the correct and widely accepted standard for TCP connection establishment.',
  },
  {
    topic: 'Banker\'s Algorithm Complexity',
    sourceA: { name: 'OS Textbook.pdf', claim: 'The time complexity of the Banker\'s Algorithm is O(n²m) where n is number of processes and m is number of resource types.' },
    sourceB: { name: 'Class Notes.pdf', claim: 'Banker\'s Algorithm runs in O(n³) time complexity for n processes.' },
    recommended: 'OS Textbook.pdf — O(n²m) is the precise complexity since m resource types must be checked for each of n processes in n iterations.',
  },
  {
    topic: 'Virtual Memory Page Size',
    sourceA: { name: 'Reference Book.pdf', claim: 'Typical page size in modern systems is 4 KB.' },
    sourceB: { name: 'Class Notes.pdf', claim: 'Modern operating systems commonly use a page size of 8 KB for better TLB coverage.' },
    recommended: 'Reference Book.pdf — 4 KB is the most widely used page size on x86 and ARM architectures, though 8 KB exists on some systems.',
  },
];

const MOCK_FLASHCARDS = [
  { q: 'What is a Deadlock?',                      a: 'A state where two or more processes are blocked forever, each waiting for a resource held by the other.' },
  { q: 'What are the four conditions for Deadlock?', a: 'Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait — all four must hold simultaneously.' },
  { q: 'What is CPU Scheduling?',                   a: 'The process of selecting which process in the ready queue gets allocated the CPU next.' },
  { q: 'Explain the Round Robin algorithm.',        a: 'Each process gets a fixed time quantum; if it doesn\'t finish, it goes to the back of the ready queue.' },
  { q: 'What is Paging in OS?',                    a: 'A memory management scheme that maps fixed-size logical pages to physical memory frames using a page table.' },
  { q: 'What is the Banker\'s Algorithm?',          a: 'A deadlock avoidance algorithm that simulates resource allocation to ensure the system stays in a safe state.' },
  { q: 'Define Thrashing.',                        a: 'A condition where excessive paging causes the CPU to spend more time swapping pages than executing processes.' },
  { q: 'What is a Semaphore?',                     a: 'A synchronisation primitive with two atomic operations: wait (P) and signal (V), used to control access to shared resources.' },
  { q: 'What is a Critical Section?',              a: 'A segment of code that accesses shared resources and must not be executed by more than one process at a time.' },
  { q: 'Explain Segmentation.',                    a: 'A memory management technique where memory is divided into variable-size segments corresponding to logical units like code, stack, and data.' },
  { q: 'What is a Page Fault?',                    a: 'An interrupt raised when a process accesses a page not currently in physical memory, requiring the OS to load it from disk.' },
  { q: 'What is the difference between process and thread?', a: 'A process is an independent program in execution with its own memory space; a thread is a lightweight unit within a process that shares its memory.' },
];

const MOCK_QUIZ = {
  mcq: [
    {
      q: 'Which of the following is NOT a necessary condition for deadlock?',
      options: ['Mutual Exclusion', 'Hold and Wait', 'Preemption', 'Circular Wait'],
      answer: 2,
    },
    {
      q: 'Which CPU scheduling algorithm can cause starvation?',
      options: ['Round Robin', 'FCFS', 'Priority Scheduling', 'SJF (non-preemptive)'],
      answer: 2,
    },
    {
      q: 'In paging, a page table entry maps:',
      options: ['Physical frame to logical page', 'Logical page to physical frame', 'Segment to page', 'Page to segment'],
      answer: 1,
    },
    {
      q: 'The Banker\'s Algorithm is used for:',
      options: ['Deadlock detection', 'Deadlock avoidance', 'Deadlock recovery', 'Deadlock prevention'],
      answer: 1,
    },
    {
      q: 'Which of these is a valid TCP handshake sequence?',
      options: ['SYN → ACK → SYN-ACK', 'SYN → SYN-ACK → ACK', 'ACK → SYN → SYN-ACK', 'SYN-ACK → SYN → ACK'],
      answer: 1,
    },
  ],
  short: [
    { q: 'What is thrashing and how can it be prevented?' },
    { q: 'Explain the difference between internal and external fragmentation.' },
    { q: 'What is the purpose of the Translation Lookaside Buffer (TLB)?' },
    { q: 'Describe the producer-consumer problem and how semaphores solve it.' },
    { q: 'What is the difference between preemptive and non-preemptive scheduling?' },
  ],
  long: [
    { q: 'Explain deadlock in detail. Describe the four necessary conditions, methods of handling deadlock (prevention, avoidance, detection & recovery), and compare their trade-offs.' },
    { q: 'Compare and contrast paging and segmentation as memory management techniques. Include advantages, disadvantages, and real-world use cases.' },
    { q: 'Explain the concept of virtual memory. How does demand paging work? What is a page fault and how is it handled?' },
  ],
};

const MOCK_REVISION = [
  {
    unit: 'Deadlock',
    points: [
      'Four necessary conditions: Mutual Exclusion, Hold & Wait, No Preemption, Circular Wait.',
      'Prevention: Negate one of the four conditions.',
      'Avoidance: Use Banker\'s Algorithm — keep system in safe state.',
      'Detection: Allow deadlock, detect using wait-for graph, then recover.',
      'Recovery: Process termination or resource preemption.',
    ],
  },
  {
    unit: 'CPU Scheduling',
    points: [
      'FCFS: Simple, non-preemptive. Suffers from convoy effect.',
      'SJF: Optimal avg wait time. Requires burst time knowledge.',
      'Round Robin: Fair, preemptive. Performance depends on time quantum.',
      'Priority: Can cause starvation — solved by aging.',
      'Key metrics: CPU utilisation, throughput, turnaround time, waiting time, response time.',
    ],
  },
  {
    unit: 'Memory Management',
    points: [
      'Paging: Fixed-size pages → frames. No external fragmentation. Page table overhead.',
      'Segmentation: Variable-size segments. Matches logical structure. External fragmentation.',
      'Virtual Memory: Allows processes larger than physical RAM via demand paging.',
      'Page Replacement: FIFO, LRU, Optimal (OPT). LRU closest to optimal in practice.',
      'Thrashing: Too many page faults due to insufficient frames. Solved by working set model.',
    ],
  },
  {
    unit: 'Process Synchronisation',
    points: [
      'Critical section requires: Mutual Exclusion, Progress, Bounded Waiting.',
      'Semaphores: Binary (mutex) or counting. Operations: wait(P) and signal(V).',
      'Monitors: High-level synchronisation. Condition variables: wait() and signal().',
      'Classic problems: Producer-Consumer, Readers-Writers, Dining Philosophers.',
    ],
  },
];

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadTopicBadge();
  renderNotes();
  renderConflicts();
  renderFlashcards();
  renderQuiz('mcq');
  renderRevision();
  checkQPFromSession();
});

function loadTopicBadge() {
  const topic = sessionStorage.getItem('docnexus_topic');
  if (topic) {
    const badge = document.getElementById('topicBadge');
    badge.textContent = topic;
    badge.classList.remove('hidden');
  }
}

function checkQPFromSession() {
  // If user uploaded QPs on index page, auto-show QP panel open
  const hasQP = sessionStorage.getItem('docnexus_has_qp');
  if (hasQP === '1') {
    toggleQPPanel(true);
    document.getElementById('qpUploadArea').classList.add('hidden');
    document.getElementById('qpResultFiles').classList.remove('hidden');
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

  // Reset flashcard flip when switching away
  if (name !== 'flashcards') {
    const wrap = document.getElementById('flashcardWrap');
    if (wrap) wrap.classList.remove('flipped');
  }
}

// ─────────────────────────────────────────────
//  QP PANEL
// ─────────────────────────────────────────────

let qpOpen = false;

function toggleQPPanel(forceOpen = false) {
  qpOpen = forceOpen ? true : !qpOpen;
  const panel   = document.getElementById('qpPanel');
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
  const filesArea  = document.getElementById('qpResultFiles');
  const listEl     = document.getElementById('qpResultFileList');

  uploadArea.classList.add('hidden');
  filesArea.classList.remove('hidden');

  Array.from(fileList).forEach(file => {
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
        <div class="text-[12px] font-medium text-zinc-300 truncate">${file.name}</div>
        <div class="text-[10px] text-zinc-600">${sizeMB} MB</div>
      </div>
      <span class="text-[10px] text-[#34d399] bg-[#34d399]/10 px-2 py-1 rounded-md">Processed</span>
    `;
    listEl.appendChild(card);
  });

  // Update chatbot source label
  const lbl = document.getElementById('chatSourceLabel');
  if (lbl) lbl.textContent = 'Answering from fused notes + exam papers';
}

// ─────────────────────────────────────────────
//  NOTES
// ─────────────────────────────────────────────

function renderNotes() {
  const container = document.getElementById('notesSections');
  container.innerHTML = MOCK_NOTES.map(note => `
    <div class="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 notes-content">
      <div class="flex items-start justify-between gap-3 mb-3">
        <h3 class="!mt-0 !mb-0">${note.title}</h3>
        ${note.hasConflict ? `<span class="conflict-inline shrink-0 cursor-pointer" onclick="switchTabById('conflicts')">⚠️ Conflict</span>` : ''}
      </div>
      <p>${note.content}</p>
      <div class="flex flex-wrap gap-1 mt-3">
        ${note.sources.map(s => `<span class="source-tag">${s}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function switchTabById(name) {
  const btn = document.querySelector(`[onclick="switchTab('${name}', this)"]`);
  if (btn) switchTab(name, btn);
}

// ─────────────────────────────────────────────
//  CONFLICTS
// ─────────────────────────────────────────────

function renderConflicts() {
  const container = document.getElementById('conflictsList');
  container.innerHTML = MOCK_CONFLICTS.map((c, i) => `
    <div class="conflict-card border border-amber-500/15 bg-amber-500/5 rounded-2xl overflow-hidden cursor-pointer" onclick="this.classList.toggle('expanded')">
      <div class="flex items-center gap-3 p-5">
        <div class="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div class="flex-1">
          <div class="text-[13px] font-semibold text-zinc-200">${c.topic}</div>
          <div class="text-[11px] text-zinc-600">${c.sourceA.name} vs ${c.sourceB.name}</div>
        </div>
        <svg class="conflict-chevron w-4 h-4 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>

      <div class="conflict-body px-5 pb-5 space-y-3 border-t border-amber-500/10">
        <div class="grid md:grid-cols-2 gap-3 mt-3">
          <div class="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04]">
            <div class="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-2">${c.sourceA.name}</div>
            <div class="text-[13px] text-zinc-300 leading-relaxed">${c.sourceA.claim}</div>
          </div>
          <div class="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04]">
            <div class="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-2">${c.sourceB.name}</div>
            <div class="text-[13px] text-zinc-300 leading-relaxed">${c.sourceB.claim}</div>
          </div>
        </div>
        <div class="bg-[#34d399]/5 border border-[#34d399]/15 rounded-xl p-4">
          <div class="text-[10px] text-[#34d399] uppercase tracking-widest font-bold mb-1">Recommended</div>
          <div class="text-[13px] text-zinc-300">${c.recommended}</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
//  FLASHCARDS
// ─────────────────────────────────────────────

let currentCard = 0;

function renderFlashcards() {
  document.getElementById('cardTotal').textContent = MOCK_FLASHCARDS.length;
  renderDots();
  showCard(0);
}

function showCard(index) {
  currentCard = Math.max(0, Math.min(index, MOCK_FLASHCARDS.length - 1));
  const card = MOCK_FLASHCARDS[currentCard];
  document.getElementById('cardQ').textContent = card.q;
  document.getElementById('cardA').textContent = card.a;
  document.getElementById('cardIndex').textContent = currentCard + 1;
  document.getElementById('flashcardWrap').classList.remove('flipped');
  updateDots();
}

function nextCard() { showCard(currentCard + 1); }
function prevCard() { showCard(currentCard - 1); }

function renderDots() {
  const container = document.getElementById('flashcardDots');
  container.innerHTML = MOCK_FLASHCARDS.map((_, i) =>
    `<button onclick="showCard(${i})" id="dot-${i}" class="w-2 h-2 rounded-full transition-all duration-200 ${i === 0 ? 'bg-[#a78bfa] w-4' : 'bg-white/10 hover:bg-white/20'}"></button>`
  ).join('');
}

function updateDots() {
  MOCK_FLASHCARDS.forEach((_, i) => {
    const dot = document.getElementById('dot-' + i);
    if (!dot) return;
    dot.className = `w-2 h-2 rounded-full transition-all duration-200 ${i === currentCard ? 'bg-[#a78bfa] w-4' : 'bg-white/10 hover:bg-white/20'}`;
  });
}

// ─────────────────────────────────────────────
//  QUIZ
// ─────────────────────────────────────────────

let currentQuizType = 'mcq';

function setQuizType(type) {
  currentQuizType = type;
  ['mcq', 'short', 'long'].forEach(t => {
    const btn = document.getElementById('qt' + t.charAt(0).toUpperCase() + t.slice(1));
    const isActive = t === type;
    btn.className = `text-[11px] px-3 py-1.5 rounded-lg border font-semibold transition-all ${
      isActive
        ? 'border-[#7c6fff]/30 bg-[#7c6fff]/10 text-[#a78bfa]'
        : 'border-white/10 text-zinc-500 hover:border-white/20'
    }`;
  });
  renderQuiz(type);
}

function renderQuiz(type) {
  const container = document.getElementById('quizQuestions');
  const questions = MOCK_QUIZ[type];

  if (type === 'mcq') {
    container.innerHTML = questions.map((q, qi) => `
      <div class="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5">
        <div class="text-[13px] font-semibold text-zinc-200 mb-4">${qi + 1}. ${q.q}</div>
        <div class="space-y-2">
          ${q.options.map((opt, oi) => `
            <label class="flex items-center gap-3 p-3 rounded-xl border border-white/[0.04] hover:border-[#7c6fff]/30 hover:bg-[#7c6fff]/5 cursor-pointer transition-all group">
              <input type="radio" name="q${qi}" value="${oi}" class="accent-[#7c6fff] w-3.5 h-3.5">
              <span class="text-[13px] text-zinc-400 group-hover:text-zinc-300 transition-colors">${opt}</span>
            </label>
          `).join('')}
        </div>
        <div class="quiz-feedback hidden mt-3 p-3 rounded-xl text-[12px]" id="feedback-${qi}"></div>
      </div>
    `).join('');
  } else {
    container.innerHTML = questions.map((q, qi) => `
      <div class="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5">
        <div class="text-[13px] font-semibold text-zinc-200 mb-3">${qi + 1}. ${q.q}</div>
        <textarea placeholder="Write your answer here..." rows="${type === 'long' ? 6 : 3}"
          class="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-[13px] text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-[#7c6fff]/30 transition-colors resize-none"></textarea>
      </div>
    `).join('');
  }
}

function checkAnswers() {
  if (currentQuizType !== 'mcq') {
    alert('Open-ended answers can\'t be auto-checked. Review against your notes!');
    return;
  }

  const questions = MOCK_QUIZ.mcq;
  questions.forEach((q, qi) => {
    const selected = document.querySelector(`input[name="q${qi}"]:checked`);
    const feedback = document.getElementById('feedback-' + qi);
    if (!feedback) return;

    if (!selected) {
      feedback.className = 'quiz-feedback mt-3 p-3 rounded-xl text-[12px] bg-zinc-500/10 border border-zinc-500/20 text-zinc-400';
      feedback.textContent = 'No answer selected.';
    } else {
      const isCorrect = parseInt(selected.value) === q.answer;
      if (isCorrect) {
        feedback.className = 'quiz-feedback mt-3 p-3 rounded-xl text-[12px] bg-[#34d399]/10 border border-[#34d399]/20 text-[#34d399]';
        feedback.textContent = '✓ Correct!';
      } else {
        feedback.className = 'quiz-feedback mt-3 p-3 rounded-xl text-[12px] bg-red-500/10 border border-red-500/20 text-red-400';
        feedback.textContent = `✗ Incorrect. Correct answer: ${q.options[q.answer]}`;
      }
    }
    feedback.classList.remove('hidden');
  });
}

// ─────────────────────────────────────────────
//  REVISION SHEET
// ─────────────────────────────────────────────

function renderRevision() {
  const container = document.getElementById('revisionContent');
  container.innerHTML = MOCK_REVISION.map(section => `
    <div class="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6">
      <div class="flex items-center gap-2 mb-4">
        <div class="w-1 h-4 rounded-full bg-gradient-to-b from-[#7c6fff] to-[#a78bfa]"></div>
        <div class="font-syne text-[14px] font-bold text-zinc-200">${section.unit}</div>
      </div>
      <ul class="space-y-2">
        ${section.points.map(p => `
          <li class="flex items-start gap-2.5 text-[13px] text-zinc-400 leading-relaxed">
            <div class="w-1.5 h-1.5 rounded-full bg-[#7c6fff]/50 mt-2 shrink-0"></div>
            ${p}
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
//  CHATBOT
// ─────────────────────────────────────────────

function sendSuggestion(btn) {
  const text = btn.textContent.trim();
  const suggestions = document.getElementById('chatSuggestions');
  if (suggestions) suggestions.classList.add('hidden');
  appendUserMessage(text);
  simulateBotReply(text);
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const suggestions = document.getElementById('chatSuggestions');
  if (suggestions) suggestions.classList.add('hidden');

  appendUserMessage(text);
  simulateBotReply(text);
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

function appendBotMessage(text, sources = []) {
  const messages = document.getElementById('chatMessages');
  const el = document.createElement('div');
  el.className = 'flex gap-3 animate-slide-right';
  el.innerHTML = `
    <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c6fff] to-[#a78bfa] flex items-center justify-center shrink-0 mt-0.5">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    </div>
    <div class="bg-white/[0.04] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[82%]">
      <p class="text-[13px] text-zinc-300 leading-relaxed">${text}</p>
      ${sources.length ? `
        <div class="mt-2 flex flex-wrap gap-1">
          ${sources.map(s => `<span class="text-[10px] px-2 py-0.5 rounded-md bg-[#7c6fff]/10 border border-[#7c6fff]/20 text-[#a78bfa]">${s}</span>`).join('')}
        </div>` : ''}
    </div>`;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

// Mock bot replies — will be replaced by real RAG in backend
const BOT_REPLIES = {
  'explain deadlock': {
    text: 'A <strong>deadlock</strong> is a situation where two or more processes are permanently blocked, each waiting for a resource held by another. It requires four conditions to hold simultaneously: Mutual Exclusion, Hold & Wait, No Preemption, and Circular Wait.',
    sources: ['OS Textbook.pdf p.42', 'Class Notes.pdf p.17'],
  },
  'what are the conflicts?': {
    text: 'DocNexus found <strong>3 conflicts</strong> across your sources: (1) TCP Handshake — 3-way vs 4-way, (2) Banker\'s Algorithm complexity — O(n²m) vs O(n³), (3) Virtual Memory page size — 4 KB vs 8 KB. Check the Conflicts tab for details.',
    sources: [],
  },
  'most important topics?': {
    text: 'Based on your fused notes, the most covered topics are: <strong>Deadlock</strong> (3 sources), <strong>CPU Scheduling</strong> (3 sources), <strong>Paging</strong> (2 sources), and <strong>Process Synchronisation</strong> (2 sources).',
    sources: [],
  },
};

function simulateBotReply(userText) {
  showTypingIndicator();

  setTimeout(() => {
    removeTypingIndicator();
    const key = userText.toLowerCase();
    const match = BOT_REPLIES[key];

    if (match) {
      appendBotMessage(match.text, match.sources);
    } else {
      // Generic fallback
      appendBotMessage(
        `I searched your fused knowledge base for "<strong>${escapeHtml(userText)}</strong>". Once the backend is connected, I'll retrieve the most relevant passages with source attribution.`,
        ['Fused Knowledge Base']
      );
    }
  }, 1200 + Math.random() * 600);
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
