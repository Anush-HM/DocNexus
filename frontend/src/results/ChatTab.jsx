import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, readError } from '../lib/api.js';

const GENERIC_CHAT_TITLE = /review questions|topics? for discussion|summary|bibliograph|references|chapter outline|more figures|^m4 notes|contains only/i;

const BotAvatar = () => (
  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c6fff] to-[#a78bfa] flex items-center justify-center shrink-0 mt-0.5">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
  </div>
);

const GREETING =
  'Hi! Ask me anything from your notes — concepts, summaries, comparisons. If you added previous-year question papers in the Unified Notes tab, ask what was asked last year or most often.';

export default function ChatTab({ projectId, notes, conflicts, hasPapers }) {
  const [messages, setMessages] = useState([{ role: 'bot', text: GREETING, sources: [] }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, busy]);

  // suggestions built from the user's OWN notes (+ exam stats once papers exist)
  const suggestions = useMemo(() => {
    if (!notes.length) return [];
    const titles = notes.map((n) => n.title).filter((t) => t && t.length < 60 && !GENERIC_CHAT_TITLE.test(t));
    const pick = (i) => titles[Math.floor((i * titles.length) / 3)];
    const list = [];
    if (titles.length) list.push(`Summarize "${pick(0)}"`);
    if (titles.length > 3) list.push(`Explain "${pick(1)}"`);
    list.push('Summarize the 1st topic');
    if (conflicts.length) list.push('What are the conflicts?');
    if (hasPapers) { list.push('Which topics are asked most often?'); list.push('Which topics were asked last year?'); }
    else list.push('List all the topics');
    return list.slice(0, 5);
  }, [notes, conflicts, hasPapers]);

  async function ask(question) {
    const text = question.trim();
    if (!text || busy) return;
    setShowSuggestions(false);
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    try {
      const res = await apiFetch(`/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, includeQuestionPapers: true }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to get an answer'));
      const data = await res.json();
      setMessages((m) => [...m, { role: 'bot', text: data.answer, sources: data.sources || [] }]);
    } catch (err) {
      console.error('[chat]', err);
      setMessages((m) => [...m, { role: 'bot', text: `Sorry, I couldn't get an answer: ${err.message}`, sources: [] }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <div className="flex flex-col h-[70vh] max-h-[600px] min-h-[400px] bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.05] shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7c6fff] to-[#a78bfa] flex items-center justify-center shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
        </div>
        <div className="flex-1">
          <div className="font-syne text-[14px] font-bold text-zinc-100">Ask DocNexus</div>
          <div className="text-[11px] text-zinc-600">
            {hasPapers ? 'Answering from fused notes + exam papers' : 'Answering from your fused knowledge base'}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-2 h-2 rounded-full bg-[#34d399] animate-pulse" />
          <span className="text-[11px] text-zinc-500">Ready</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end animate-slide-right">
              <div className="bg-[#7c6fff]/20 border border-[#7c6fff]/20 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]">
                <p className="text-[13px] text-zinc-200 whitespace-pre-wrap">{m.text}</p>
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-3 animate-slide-right">
              <BotAvatar />
              <div className="bg-white/[0.04] border border-white/[0.04] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[82%]">
                <p className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap">{m.text}</p>
                {m.sources?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.sources.map((s, k) => (
                      <span key={k} className="text-[10px] px-2 py-0.5 rounded-md bg-[#7c6fff]/10 border border-[#7c6fff]/20 text-[#a78bfa]">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        )}
        {busy && (
          <div className="flex gap-3 animate-fade-in">
            <BotAvatar />
            <div className="bg-white/[0.04] rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-4">
                <div className="typing-dot w-1.5 h-1.5 rounded-full bg-zinc-500" />
                <div className="typing-dot w-1.5 h-1.5 rounded-full bg-zinc-500" />
                <div className="typing-dot w-1.5 h-1.5 rounded-full bg-zinc-500" />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-2 shrink-0">
          {suggestions.map((s) => (
            <button
              key={s} disabled={busy} onClick={() => ask(s)}
              className="text-[11px] px-3 py-1.5 rounded-xl border border-white/10 text-zinc-400 hover:border-[#7c6fff]/40 hover:text-[#a78bfa] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="px-5 pb-5 shrink-0">
        <div className="flex gap-2 bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden focus-within:border-[#7c6fff]/40 transition-colors">
          <input
            ref={inputRef} type="text" value={input} disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ask(input); }}
            placeholder="Ask anything from your notes..."
            className="flex-1 bg-transparent px-4 py-3.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none disabled:opacity-50"
          />
          <button onClick={() => ask(input)} disabled={busy} aria-label="Send" className="px-4 text-[#7c6fff] hover:text-[#a78bfa] transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
