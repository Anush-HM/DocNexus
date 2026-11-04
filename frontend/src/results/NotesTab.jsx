import { useEffect, useMemo, useState } from 'react';
import { apiFetch, escapeHtml } from '../lib/api.js';
import { cleanTitle, formatNoteContent, noteHasBody } from '../lib/noteFormat.js';
import { downloadPdf } from '../lib/download.js';
import QPPanel from './QPPanel.jsx';

function NoteCards({ notes, onShowConflicts }) {
  const shown = useMemo(() => notes.filter(noteHasBody), [notes]);
  if (!shown.length) return <div className="text-center py-12 text-zinc-500 text-sm">No notes yet.</div>;

  // the same figure must not appear under several notes
  const seen = new Set();
  return (
    <div className="space-y-4">
      {shown.map((note, i) => {
        const diagrams = (note.diagrams || []).filter((d) => {
          const key = d.image || d.svg;
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return (
          <div key={i} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 notes-content">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="!mt-0 !mb-0">{cleanTitle(note.title)}</h3>
              {note.hasConflict && (
                <span className="conflict-inline shrink-0" onClick={onShowConflicts}>⚠️ Conflict</span>
              )}
            </div>
            <div className="notes-body" dangerouslySetInnerHTML={{ __html: formatNoteContent(note.content) }} />
            {diagrams.length > 0 && (
              <div className="flex flex-col gap-4 mt-5 mb-2">
                {diagrams.map((d, k) => (
                  <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 overflow-x-auto hover:border-[#7c6fff]/40 transition-colors">
                    {d.image ? (
                      <img src={d.image} alt={d.description || 'Figure'} loading="lazy" style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto', borderRadius: 6 }} />
                    ) : (
                      <div style={{ maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: d.svg || '' }} />
                    )}
                    {d.description && <div className="text-[11px] text-zinc-600 mt-3 italic">{d.description}</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1 mt-4">
              {(note.sources || []).map((s, k) => <span key={k} className="source-tag" dangerouslySetInnerHTML={{ __html: escapeHtml(s) }} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function NotesTab({ projectId, notes, loaded, stats, qpInitial, onQpReady, onShowConflicts }) {
  // The Notes tab shows the notes as a real PDF; if it can't be built, it falls back to cards.
  const [pdfUrl, setPdfUrl] = useState(null);
  const [state, setState] = useState('loading'); // loading | pdf | cards
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!loaded) return undefined;
    if (!notes.length) { setState('cards'); return undefined; }
    let cancelled = false;
    let url = null;
    setState('loading');
    (async () => {
      try {
        const res = await apiFetch(`/projects/${projectId}/export/notes?inline=1`);
        if (!res.ok) throw new Error('PDF unavailable');
        url = URL.createObjectURL(await res.blob());
        if (cancelled) { URL.revokeObjectURL(url); return; }
        setPdfUrl(url);
        setState('pdf');
      } catch (err) {
        console.warn('[notes] PDF view failed, using card view:', err);
        if (!cancelled) setState('cards');
      }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [projectId, notes, loaded]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="text-[11px] text-zinc-600 uppercase tracking-widest font-bold">
          {loaded ? `${stats.topicsMerged ?? 0} topics · ${stats.sourcesUsed ?? 0} sources` : 'Loading...'}
        </div>
        <button
          disabled={exporting}
          onClick={async () => { setExporting(true); await downloadPdf(projectId, 'notes'); setExporting(false); }}
          className="text-[12px] text-[#a78bfa] flex items-center gap-1.5 hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          {exporting ? 'Preparing PDF…' : 'Export PDF'}
        </button>
      </div>

      <QPPanel projectId={projectId} initiallyHasPapers={qpInitial} onReady={onQpReady} />

      {!loaded || state === 'loading' ? (
        <div className="text-center py-12 text-zinc-500 text-sm">{loaded ? 'Preparing PDF view…' : 'Loading...'}</div>
      ) : state === 'pdf' ? (
        <iframe
          src={`${pdfUrl}#view=FitH`} title="Unified Notes PDF"
          style={{ width: '100%', height: '82vh', minHeight: 560, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, background: '#fff' }}
        />
      ) : (
        <NoteCards notes={notes} onShowConflicts={onShowConflicts} />
      )}
    </div>
  );
}
