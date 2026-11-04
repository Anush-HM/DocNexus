import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Layout.jsx';
import { apiFetch, isNetworkError, readError } from '../lib/api.js';

// User-facing stages only; each maps to a backend progress step key.
const STEPS = [
  { id: 'extract', label: 'Reading your documents', icon: '📄', pct: 15 },
  { id: 'understand', label: 'Understanding the content', icon: '🧠', pct: 50 },
  { id: 'match', label: 'Finding overlapping topics', icon: '🔗', pct: 65 },
  { id: 'conflict', label: 'Checking for contradictions', icon: '⚠️', pct: 78 },
  { id: 'fuse', label: 'Writing unified notes', icon: '⚡', pct: 88 },
  { id: 'studymaterial', label: 'Creating flashcards & quizzes', icon: '🗂️', pct: 96 },
  { id: 'done', label: 'Finalising', icon: '✅', pct: 100 },
];
const POLL_MS = 1500;

function AnimatedNumber({ value }) {
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (value == null) return undefined;
    let val = 0;
    const step = Math.max(1, Math.ceil(value / 16));
    const t = setInterval(() => {
      val = Math.min(val + step, value);
      setShown(val);
      if (val >= value) clearInterval(t);
    }, 50);
    return () => clearInterval(t);
  }, [value]);
  return <>{shown == null ? '–' : shown}</>;
}

function FileCard({ file, onRemove }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl w-full">
      <div className="w-10 h-10 rounded-xl bg-[#7c6fff]/15 flex items-center justify-center shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-zinc-200 truncate">{file.name}</div>
        <div className="text-[11px] text-zinc-600">{(file.size / 1048576).toFixed(1)} MB · PDF</div>
      </div>
      <button type="button" onClick={onRemove} className="text-zinc-600 hover:text-red-400 transition-colors p-1" aria-label={`Remove ${file.name}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  );
}

export default function Upload() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [topic, setTopic] = useState('');
  const [dragging, setDragging] = useState(false);

  const [phase, setPhase] = useState('upload'); // 'upload' | 'processing'
  const [projectId, setProjectId] = useState(null);
  const [stepIdx, setStepIdx] = useState(-1);
  const [progress, setProgress] = useState({ pct: 0, label: 'Starting...' });
  const [failed, setFailed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [stats, setStats] = useState(null);

  function addFiles(list) {
    const incoming = Array.from(list || []).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    setFiles((cur) => {
      const names = new Set(cur.map((f) => f.name));
      return [...cur, ...incoming.filter((f) => !names.has(f.name))];
    });
    if (inputRef.current) inputRef.current.value = '';
  }

  const totalMB = files.reduce((s, f) => s + f.size / 1048576, 0);
  const canStart = files.length >= 2;

  async function startFusion() {
    if (!canStart) return;
    if (topic.trim()) { try { sessionStorage.setItem('docnexus_topic', topic.trim()); } catch { /* ignore */ } }
    setPhase('processing');
    setStepIdx(-1);
    setFailed(false);
    setProgress({ pct: 5, label: STEPS[0].label });
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const res = await apiFetch('/projects/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await readError(res, 'Upload failed'));
      const { projectId: id } = await res.json();
      setProjectId(id);
    } catch (err) {
      setFailed(true);
      setProgress({
        pct: 0,
        label: isNetworkError(err) ? 'Cannot reach the backend (is it running on port 5000?)' : `Upload failed: ${err.message}`,
      });
    }
  }

  // poll the backend while the project is being processed
  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    let timer;
    let failures = 0;
    let last = -1;

    const poll = async () => {
      try {
        const res = await apiFetch(`/projects/${projectId}/status`);
        if (!res.ok) throw new Error('status check failed');
        const data = await res.json();
        failures = 0;
        if (cancelled) return;

        const idx = STEPS.findIndex((s) => s.id === data.progress?.step);
        if (idx > last) {
          last = idx;
          setStepIdx(idx);
          setProgress({ pct: STEPS[idx].pct, label: STEPS[idx].label });
        }

        if (data.status === 'ready') {
          setFinished(true);
          setStepIdx(STEPS.length);
          setProgress({ pct: 100, label: 'Done!' });
          setStats(data.stats || { duplicatesRemoved: 0, conflictsFound: 0 });
          try { sessionStorage.setItem('docnexus_project_id', projectId); } catch { /* ignore */ }
          timer = setTimeout(() => navigate(`/results/${projectId}`), 900);
          return;
        }
        if (data.status === 'failed') {
          setFailed(true);
          setProgress({ pct: STEPS[Math.max(last, 0)].pct, label: 'Something went wrong. Please try again.' });
          return;
        }
        timer = setTimeout(poll, POLL_MS);
      } catch {
        if (cancelled) return;
        failures += 1;
        setProgress({
          pct: STEPS[Math.max(last, 0)].pct,
          label: failures >= 4
            ? "Can't reach the backend (is `npm run dev` running in the backend folder?). Retrying..."
            : 'Connection lost. Retrying...',
        });
        timer = setTimeout(poll, POLL_MS * 2);
      }
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [projectId, navigate]);

  function tryAgain() {
    setPhase('upload');
    setProjectId(null);
    setFailed(false);
    setFinished(false);
    setStats(null);
    setStepIdx(-1);
  }

  return (
    <>
      <div className="fixed top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(124,111,255,0.12)_0%,transparent_70%)] pointer-events-none z-0" />
      <Navbar>
        <Link to="/projects" className="text-[12px] text-zinc-400 hover:text-zinc-100 border border-white/10 rounded-lg px-3 py-1.5 transition-colors">My projects</Link>
      </Navbar>

      {phase === 'upload' ? (
        <div>
          <div className="animate-fade-up pt-14 px-6 pb-10 text-center">
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tighter leading-tight mb-4">
              Turn scattered docs into<br />
              <span className="bg-gradient-to-r from-[#a78bfa] via-[#60a5fa] to-[#34d399] bg-clip-text text-transparent inline-block py-1">
                one perfect knowledge base
              </span>
            </h1>
            <p className="text-[15px] text-zinc-500 max-w-[480px] mx-auto leading-relaxed">
              Upload multiple PDFs on the same topic and get back a single, clean document automatically.
            </p>
          </div>

          <div className="animate-fade-up-delayed max-w-[680px] mx-auto px-6 pb-20">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={`group border-2 border-dashed rounded-[24px] p-12 text-center cursor-pointer transition-all duration-300 ${
                dragging ? 'bg-[#7c6fff]/10 border-[#7c6fff]/60' : 'border-[#7c6fff]/30 bg-[#7c6fff]/5 hover:border-[#7c6fff]/60'
              }`}
            >
              <input ref={inputRef} type="file" multiple accept=".pdf" onChange={(e) => addFiles(e.target.files)} className="hidden" />
              <div className="w-16 h-16 rounded-2xl bg-[#7c6fff]/15 border border-[#7c6fff]/20 flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform animate-float">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              </div>
              <div className="font-syne text-lg font-bold text-zinc-200 mb-1">Drag &amp; drop your PDFs here</div>
              <div className="text-sm text-zinc-600 mb-6">Supports multiple PDF files</div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                className="bg-[#7c6fff] hover:bg-[#6b5eff] text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors shadow-lg shadow-[#7c6fff]/20"
              >
                Browse Files
              </button>
            </div>

            {files.length > 0 && (
              <div className="flex items-center gap-4 mt-12 mb-6">
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-[11px] font-bold text-zinc-700 tracking-[0.2em] uppercase">Uploaded Files</span>
                <div className="flex-1 h-px bg-white/5" />
              </div>
            )}

            <div className={`flex flex-col gap-3 ${files.length ? '' : 'mt-8'}`}>
              {files.map((f) => (
                <FileCard key={f.name} file={f} onRemove={() => setFiles((cur) => cur.filter((x) => x.name !== f.name))} />
              ))}
              <button
                type="button" onClick={() => inputRef.current?.click()}
                className="flex items-center gap-3 p-4 w-full border border-dashed border-white/10 rounded-2xl cursor-pointer text-zinc-500 text-sm hover:border-[#7c6fff]/40 transition-all"
              >
                <div className="w-6 h-6 rounded-full border border-current flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </div>
                Add more documents
              </button>
            </div>

            <div className="mt-8 mb-2">
              <label className="font-syne text-[11px] font-bold text-zinc-600 uppercase tracking-widest">
                Topic Label <span className="lowercase font-normal opacity-50">(optional)</span>
              </label>
            </div>
            <input
              type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Machine Learning, Operating Systems..."
              className="w-full p-4 rounded-xl border border-white/5 bg-white/5 text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-[#7c6fff]/40 focus:bg-[#7c6fff]/5 transition-all"
            />

            <div className="flex flex-wrap items-end justify-between mt-10 gap-6 border-t border-white/5 pt-8">
              <div className="flex gap-8 pb-1">
                <div>
                  <div className="font-syne text-2xl font-bold text-zinc-200 leading-tight">{files.length}</div>
                  <div className="text-[11px] text-zinc-600 font-bold uppercase tracking-wider">Documents</div>
                </div>
                <div>
                  <div className="font-syne text-2xl font-bold text-zinc-200 leading-tight">{totalMB.toFixed(1)} MB</div>
                  <div className="text-[11px] text-zinc-600 font-bold uppercase tracking-wider">Total Size</div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-3">
                {!canStart && (
                  <div className="text-[11px] font-medium text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 whitespace-nowrap">
                    Add at least 2 documents to fuse
                  </div>
                )}
                <button
                  onClick={startFusion} disabled={!canStart}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] text-white font-bold text-sm shadow-xl shadow-[#7c6fff]/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-20 disabled:scale-100 disabled:shadow-none transition-all"
                >
                  Start Fusion
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-[85vh] flex flex-col items-center justify-center px-6 py-16 animate-fade-in">
          <div className="relative mb-10">
            <div className="pulse-ring absolute inset-[-12px] rounded-full bg-[#7c6fff]/15 blur-lg" />
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#7c6fff] to-[#a78bfa] flex items-center justify-center shadow-2xl shadow-[#7c6fff]/40 relative">
              <svg className={failed ? '' : 'spin-slow'} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10" /></svg>
            </div>
          </div>
          <h2 className="font-syne text-xl font-bold text-zinc-100 mb-2 text-center">Fusing your knowledge base</h2>
          <p className="text-[13px] text-zinc-500 mb-8 text-center">Analysing documents and detecting overlaps...</p>

          <div className="w-full max-w-xs mb-8">
            <div className="flex justify-between text-[11px] text-zinc-600 mb-1.5">
              <span>{progress.label}</span><span>{progress.pct}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] rounded-full transition-all duration-700" style={{ width: `${progress.pct}%` }} />
            </div>
          </div>

          <div className="w-full max-w-sm space-y-2">
            {STEPS.map((s, i) => {
              const done = i < stepIdx || finished;
              const active = i === stepIdx && !finished;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 ${
                    active ? 'border-[#7c6fff]/30 bg-[#7c6fff]/5 opacity-100'
                      : done ? 'border-white/[0.04] bg-white/[0.02] opacity-60'
                        : 'border-white/[0.04] bg-white/[0.02] opacity-30'
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-sm shrink-0">{s.icon}</div>
                  <div className="text-[13px] text-zinc-400 flex-1">{s.label}</div>
                  <div className="w-4 h-4 flex items-center justify-center">
                    {done ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : active ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-[#7c6fff] animate-pulse" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex gap-8 text-center">
            <div>
              <div className="font-syne text-xl font-bold text-zinc-200"><AnimatedNumber value={stats ? stats.duplicatesRemoved ?? 0 : null} /></div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Duplicates</div>
            </div>
            <div className="w-px bg-white/5" />
            <div>
              <div className="font-syne text-xl font-bold text-zinc-200"><AnimatedNumber value={stats ? stats.conflictsFound ?? 0 : null} /></div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Conflicts</div>
            </div>
          </div>

          {failed && (
            <button onClick={tryAgain} className="mt-8 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] text-white text-sm font-bold">
              Back to upload
            </button>
          )}
        </div>
      )}
    </>
  );
}
