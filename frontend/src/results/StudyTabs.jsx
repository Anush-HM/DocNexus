import { useEffect, useState } from 'react';
import { downloadPdf } from '../lib/download.js';

const Generating = ({ children }) => (
  <div className="text-center py-12 text-zinc-500 text-sm">{children}</div>
);

// ───────────────────────── Flashcards ─────────────────────────
export function FlashcardsTab({ cards, status }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const total = cards.length;

  useEffect(() => { setIdx(0); setFlipped(false); }, [total]);

  const go = (i) => { setIdx(Math.max(0, Math.min(i, total - 1))); setFlipped(false); };
  const card = cards[idx];
  const generating = status === 'generating';
  const failedLoad = status === 'error';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="text-[11px] text-zinc-600 uppercase tracking-widest font-bold">
          {status === 'loading' ? 'Loading...' : `${total} card${total === 1 ? '' : 's'} generated`}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-zinc-500">{total ? idx + 1 : 0} / {total}</span>
          <button onClick={() => go(idx - 1)} className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-all" aria-label="Previous card">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button onClick={() => go(idx + 1)} className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-all" aria-label="Next card">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>

      <div className={`flashcard-wrap cursor-pointer ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
        <div className="flashcard-inner">
          <div className="flashcard-front bg-white/[0.03] border border-white/[0.06] rounded-2xl p-10 min-h-[220px] flex flex-col items-center justify-center text-center">
            <div className="text-[10px] text-zinc-700 uppercase tracking-widest font-bold mb-4">Question</div>
            <div className="font-syne text-lg font-bold text-zinc-100">
              {generating ? 'Generating...' : failedLoad ? 'Unable to load' : card?.q}
            </div>
            <div className="mt-6 text-[11px] text-zinc-600">Tap to reveal answer</div>
          </div>
          <div className="flashcard-back bg-gradient-to-br from-[#7c6fff]/10 to-[#a78bfa]/5 border border-[#7c6fff]/20 rounded-2xl p-10 min-h-[220px] flex flex-col items-center justify-center text-center">
            <div className="text-[10px] text-[#a78bfa] uppercase tracking-widest font-bold mb-4">Answer</div>
            <div className="text-[14px] text-zinc-300 leading-relaxed">
              {generating ? 'Flashcards are being created in the background.' : card?.a}
            </div>
            <div className="mt-4 text-[11px] text-zinc-600">Tap to flip back</div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-4 flex-wrap">
        {cards.map((_, i) => (
          <button
            key={i} onClick={() => go(i)} aria-label={`Card ${i + 1}`}
            className={`h-2 rounded-full transition-all duration-200 ${i === idx ? 'bg-[#a78bfa] w-4' : 'bg-white/10 hover:bg-white/20 w-2'}`}
          />
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Quiz ─────────────────────────
export function QuizTab({ quiz, status }) {
  const [type, setType] = useState('mcq');
  const [answers, setAnswers] = useState({}); // question index -> chosen option index
  const [checked, setChecked] = useState(false);
  const questions = quiz[type] || [];
  const total = (quiz.mcq?.length || 0) + (quiz.short?.length || 0) + (quiz.long?.length || 0);

  const pick = (t) => { setType(t); setAnswers({}); setChecked(false); };

  function check() {
    if (type !== 'mcq') { alert("Open-ended answers can't be auto-checked. Review against your notes!"); return; }
    setChecked(true);
  }

  const typeBtn = (t, label) => (
    <button
      key={t} onClick={() => pick(t)}
      className={`text-[11px] px-3 py-1.5 rounded-lg border font-semibold transition-all ${
        type === t ? 'border-[#7c6fff]/30 bg-[#7c6fff]/10 text-[#a78bfa]' : 'border-white/10 text-zinc-500 hover:border-white/20'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="text-[11px] text-zinc-600 uppercase tracking-widest font-bold">
          {status === 'loading' ? 'Loading...' : `${total} question${total === 1 ? '' : 's'} generated`}
        </div>
        <div className="flex gap-2">{typeBtn('mcq', 'MCQ')}{typeBtn('short', 'Short Answer')}{typeBtn('long', 'Long Answer')}</div>
      </div>

      {status === 'generating' ? (
        <Generating>Generating flashcards, quiz, and revision sheet — notes are ready in the meantime.</Generating>
      ) : status === 'error' ? (
        <Generating>Study material could not be loaded.</Generating>
      ) : questions.length === 0 ? (
        <Generating>No questions generated yet.</Generating>
      ) : (
        <div className="space-y-4">
          {questions.map((q, qi) => {
            const sel = answers[qi];
            const isCorrect = sel === q.answer;
            return (
              <div key={qi} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5">
                <div className={`text-[13px] font-semibold text-zinc-200 ${type === 'mcq' ? 'mb-4' : 'mb-3'}`}>{qi + 1}. {q.q}</div>
                {type === 'mcq' ? (
                  <>
                    <div className="space-y-2">
                      {q.options.map((opt, oi) => (
                        <label key={oi} className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.04] hover:border-[#7c6fff]/30 hover:bg-[#7c6fff]/5 cursor-pointer transition-all group">
                          <input
                            type="radio" name={`q${qi}`} className="accent-[#7c6fff] w-3.5 h-3.5"
                            checked={sel === oi} onChange={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                          />
                          <span className="text-[13px] text-zinc-400 group-hover:text-zinc-300 transition-colors">{opt}</span>
                        </label>
                      ))}
                    </div>
                    {checked && (
                      <div
                        className={`mt-3 p-3 rounded-xl text-[12px] border ${
                          sel == null ? 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
                            : isCorrect ? 'bg-[#34d399]/10 border-[#34d399]/20 text-[#34d399]'
                              : 'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}
                      >
                        {sel == null ? 'No answer selected.' : isCorrect ? '✓ Correct!' : `✗ Incorrect. Correct answer: ${q.options[q.answer]}`}
                      </div>
                    )}
                  </>
                ) : (
                  <textarea
                    placeholder="Write your answer here..." rows={type === 'long' ? 6 : 3}
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-[13px] text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-[#7c6fff]/30 transition-colors resize-none"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <button onClick={check} className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] text-white text-sm font-bold hover:opacity-90 transition-opacity">
        Check Answers
      </button>
    </div>
  );
}

// ───────────────────────── Revision sheet ─────────────────────────
export function RevisionTab({ projectId, revision, status }) {
  const [exporting, setExporting] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="text-[11px] text-zinc-600 uppercase tracking-widest font-bold">Quick revision — all key points</div>
        <button
          disabled={exporting}
          onClick={async () => { setExporting(true); await downloadPdf(projectId, 'revision'); setExporting(false); }}
          className="text-[12px] text-[#a78bfa] flex items-center gap-1.5 hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          {exporting ? 'Preparing PDF…' : 'Export'}
        </button>
      </div>

      {status === 'generating' ? (
        <Generating>Generating flashcards, quiz, and revision sheet — notes are ready in the meantime.</Generating>
      ) : status === 'error' ? (
        <Generating>Study material could not be loaded.</Generating>
      ) : revision.length === 0 ? (
        <Generating>No revision sheet generated yet.</Generating>
      ) : (
        <div className="space-y-5">
          {revision.map((section, i) => (
            <div key={i} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 rounded-full bg-gradient-to-b from-[#7c6fff] to-[#a78bfa]" />
                <div className="font-syne text-[14px] font-bold text-zinc-200">{section.unit}</div>
              </div>
              <ul className="space-y-2">
                {(section.points || []).map((p, k) => (
                  <li key={k} className="flex items-start gap-2.5 text-[13px] text-zinc-400 leading-relaxed">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#7c6fff]/50 mt-2 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
