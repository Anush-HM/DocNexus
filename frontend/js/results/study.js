// ─────────────────────────────────────────────
//  DocNexus — Results Page: Study Materials
//  Flashcards, Quiz, Revision sheet rendering.
//  Depends on globals from core.js (FLASHCARDS,
//  QUIZ, REVISION, escapeHtml).
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  FLASHCARDS
// ─────────────────────────────────────────────

let currentCard = 0;

function renderFlashcards() {
  const total = FLASHCARDS.length;
  document.getElementById('cardTotal').textContent = total;
  const subtitle = document.getElementById('flashcardsSubtitle');
  if (subtitle) subtitle.textContent = `${total} card${total === 1 ? '' : 's'} generated`;

  renderDots();
  if (total > 0) showCard(0);
}

function showCard(index) {
  if (FLASHCARDS.length === 0) return;
  currentCard = Math.max(0, Math.min(index, FLASHCARDS.length - 1));
  const card = FLASHCARDS[currentCard];
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
  container.innerHTML = FLASHCARDS.map((_, i) =>
    `<button onclick="showCard(${i})" id="dot-${i}" class="w-2 h-2 rounded-full transition-all duration-200 ${i === 0 ? 'bg-[#a78bfa] w-4' : 'bg-white/10 hover:bg-white/20'}"></button>`
  ).join('');
}

function updateDots() {
  FLASHCARDS.forEach((_, i) => {
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
  const questions = QUIZ[type] || [];

  const subtitle = document.getElementById('quizSubtitle');
  if (subtitle) {
    const total = (QUIZ.mcq?.length || 0) + (QUIZ.short?.length || 0) + (QUIZ.long?.length || 0);
    subtitle.textContent = `${total} question${total === 1 ? '' : 's'} generated`;
  }

  if (questions.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-zinc-500 text-sm">No questions generated yet.</div>`;
    return;
  }

  if (type === 'mcq') {
    container.innerHTML = questions.map((q, qi) => `
      <div class="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5">
        <div class="text-[13px] font-semibold text-zinc-200 mb-4">${qi + 1}. ${escapeHtml(q.q)}</div>
        <div class="space-y-2">
          ${q.options.map((opt, oi) => `
            <label class="flex items-center gap-3 p-3 rounded-xl border border-white/[0.04] hover:border-[#7c6fff]/30 hover:bg-[#7c6fff]/5 cursor-pointer transition-all group">
              <input type="radio" name="q${qi}" value="${oi}" class="accent-[#7c6fff] w-3.5 h-3.5">
              <span class="text-[13px] text-zinc-400 group-hover:text-zinc-300 transition-colors">${escapeHtml(opt)}</span>
            </label>
          `).join('')}
        </div>
        <div class="quiz-feedback hidden mt-3 p-3 rounded-xl text-[12px]" id="feedback-${qi}"></div>
      </div>
    `).join('');
  } else {
    container.innerHTML = questions.map((q, qi) => `
      <div class="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5">
        <div class="text-[13px] font-semibold text-zinc-200 mb-3">${qi + 1}. ${escapeHtml(q.q)}</div>
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

  const questions = QUIZ.mcq || [];
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
        feedback.textContent = `✗ Incorrect. Correct answer: ${escapeHtml(q.options[q.answer])}`;
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
  if (REVISION.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-zinc-500 text-sm">No revision sheet generated yet.</div>`;
    return;
  }
  container.innerHTML = REVISION.map(section => `
    <div class="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6">
      <div class="flex items-center gap-2 mb-4">
        <div class="w-1 h-4 rounded-full bg-gradient-to-b from-[#7c6fff] to-[#a78bfa]"></div>
        <div class="font-syne text-[14px] font-bold text-zinc-200">${escapeHtml(section.unit)}</div>
      </div>
      <ul class="space-y-2">
        ${(section.points || []).map(p => `
          <li class="flex items-start gap-2.5 text-[13px] text-zinc-400 leading-relaxed">
            <div class="w-1.5 h-1.5 rounded-full bg-[#7c6fff]/50 mt-2 shrink-0"></div>
            ${escapeHtml(p)}
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');
}