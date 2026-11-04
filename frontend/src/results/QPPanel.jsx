import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, readError } from '../lib/api.js';

function ExamTopics({ topics }) {
  if (!topics || topics.length === 0) {
    return <div className="text-[12px] text-zinc-600 border-t border-white/5 pt-5 mt-5">No clear topic matches found yet.</div>;
  }
  const max = Math.max(...topics.map((t) => t.count));
  return (
    <div className="border-t border-white/5 pt-5 mt-5">
      <div className="text-[11px] text-zinc-600 uppercase tracking-widest font-bold mb-3">Most Asked Topics</div>
      <div className="space-y-2">
        {topics.slice(0, 8).map((t, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="text-[12px] text-zinc-400 w-4 font-bold">{i + 1}</div>
            <div className="flex-1 text-[13px] text-zinc-300">
              {t.topic}
              {(t.papers || []).length > 0 && (
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {t.papers.length > 1 ? 'Recurring · ' : ''}
                  {t.papers.map((p) => String(p.year || p.name).replace(/\.pdf$/i, '') + (p.count > 1 ? ' ×' + p.count : '')).join(' · ')}
                </div>
              )}
            </div>
            <div className="text-[11px] text-[#a78bfa] font-bold">{t.count}×</div>
            <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-[#a78bfa] rounded-full" style={{ width: `${Math.round((t.count / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const statusCls = {
  Queued: 'text-zinc-400 bg-white/5',
  Processing: 'text-amber-400 bg-amber-500/10',
  Processed: 'text-[#34d399] bg-[#34d399]/10',
};

// Optional previous-year question papers: upload, wait for analysis, show most-asked topics.
export default function QPPanel({ projectId, initiallyHasPapers, onReady }) {
  const inputRef = useRef(null);
  const timer = useRef(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]); // [{ name, size }]
  const [fileStatus, setFileStatus] = useState('Queued');
  const [banner, setBanner] = useState(null); // { text, error }
  const [topics, setTopics] = useState(null);
  const [showFiles, setShowFiles] = useState(false);

  const poll = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      const res = await apiFetch(`/projects/${projectId}/qp-status`);
      if (!res.ok) throw new Error('status check failed');
      const data = await res.json();
      if (data.qpStatus === 'ready') {
        setFileStatus('Processed');
        setBanner({ text: 'Analysis complete.' });
        setTopics(data.examTopics || []);
        onReady?.(data.examTopics || []);
        return;
      }
      if (data.qpStatus === 'failed') {
        setBanner({ text: data.qpErrorMessage || 'Analysis failed.', error: true });
        return;
      }
      timer.current = setTimeout(poll, 2000);
    } catch (err) {
      console.error('[qp poll]', err);
      timer.current = setTimeout(poll, 4000);
    }
  }, [projectId, onReady]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // a project that already has papers: open the panel and load the cached analysis
  useEffect(() => {
    if (!initiallyHasPapers || !projectId) return;
    setOpen(true);
    setShowFiles(true);
    (async () => {
      try {
        const res = await apiFetch(`/projects/${projectId}/exam-analysis`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.topics && data.topics.length) { setTopics(data.topics); onReady?.(data.topics); }
      } catch (err) { console.error('[exam analysis]', err); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiallyHasPapers, projectId]);

  async function handleFiles(list) {
    const pdfs = Array.from(list || []).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) return;
    setFiles(pdfs.map((f) => ({ name: f.name, size: f.size })));
    setShowFiles(true);
    setFileStatus('Queued');
    setTopics(null);
    setBanner({ text: 'Uploading and analysing your question papers...' });
    try {
      const fd = new FormData();
      pdfs.forEach((f) => fd.append('questionPapers', f));
      const res = await apiFetch(`/projects/${projectId}/question-papers`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await readError(res, 'Upload failed'));
      setFileStatus('Processing');
      poll();
    } catch (err) {
      console.error('[qp upload]', err);
      setBanner({ text: `Upload failed: ${err.message}`, error: true });
    }
  }

  return (
    <div className="mb-5">
      <div
        onClick={() => setOpen((o) => !o)}
        className="border border-dashed border-[#a78bfa]/20 rounded-2xl p-5 flex items-center justify-between gap-4 hover:border-[#a78bfa]/40 transition-all cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#a78bfa]/10 flex items-center justify-center shrink-0">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-zinc-300">Add previous-year question papers</div>
            <div className="text-[11px] text-zinc-600">Get exam analysis, topic frequency, and priority insights</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#a78bfa]/10 text-[#a78bfa] border border-[#a78bfa]/20 font-medium">Optional</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>

      {open && (
        <div className="mt-3 bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6">
          {!showFiles && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className="border border-dashed border-[#a78bfa]/25 rounded-xl p-8 text-center cursor-pointer hover:border-[#a78bfa]/50 transition-all mb-4"
            >
              <div className="text-[13px] text-zinc-400 mb-1">Drop your question papers here</div>
              <div className="text-[11px] text-zinc-600 mb-3">Previous exams, sample papers, past year PDFs</div>
              <button type="button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }} className="text-[12px] px-4 py-1.5 rounded-lg border border-[#a78bfa]/30 text-[#a78bfa] hover:bg-[#a78bfa]/10 transition-colors">Browse</button>
            </div>
          )}
          <input ref={inputRef} type="file" multiple accept=".pdf" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />

          {showFiles && (
            <div>
              {banner && <div className={`text-[12px] mb-3 ${banner.error ? 'text-red-400' : 'text-[#a78bfa]'}`}>{banner.text}</div>}
              {files.length > 0 && (
                <div className="flex flex-col gap-2 mb-5">
                  {files.map((f) => (
                    <div key={f.name} className="flex items-center gap-3 p-3 bg-[#a78bfa]/5 border border-[#a78bfa]/15 rounded-xl">
                      <div className="w-7 h-7 rounded-lg bg-[#a78bfa]/10 flex items-center justify-center shrink-0">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-zinc-300 truncate">{f.name}</div>
                        <div className="text-[10px] text-zinc-600">{(f.size / 1048576).toFixed(1)} MB</div>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-md ${statusCls[fileStatus]}`}>{fileStatus}</span>
                    </div>
                  ))}
                </div>
              )}
              {topics && <ExamTopics topics={topics} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
