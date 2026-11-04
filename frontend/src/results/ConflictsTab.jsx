import { useState } from 'react';

function ConflictCard({ c }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`conflict-card ${open ? 'expanded' : ''} border border-amber-500/15 bg-amber-500/5 rounded-2xl overflow-hidden cursor-pointer`}
      onClick={() => setOpen((o) => !o)}
    >
      <div className="flex items-center gap-3 p-5">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-zinc-200">{c.topic}</div>
          <div className="text-[11px] text-zinc-600">{c.sourceA?.name || ''} vs {c.sourceB?.name || ''}</div>
        </div>
        <svg className="conflict-chevron w-4 h-4 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
      </div>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-amber-500/10">
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            {[c.sourceA, c.sourceB].map((s, i) => (
              <div key={i} className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04]">
                <div className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-2">{s?.name || ''}</div>
                <div className="text-[13px] text-zinc-300 leading-relaxed">{s?.claim || ''}</div>
              </div>
            ))}
          </div>
          <div className="bg-[#34d399]/5 border border-[#34d399]/15 rounded-xl p-4">
            <div className="text-[10px] text-[#34d399] uppercase tracking-widest font-bold mb-1">Recommended</div>
            <div className="text-[13px] text-zinc-300">{c.recommended || ''}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConflictsTab({ conflicts, noteCount, loaded }) {
  const n = conflicts.length;
  const agreed = Math.max((noteCount || 0) - n, 0);
  return (
    <div>
      <div className="text-[11px] text-zinc-600 uppercase tracking-widest font-bold mb-5">
        {loaded ? `${n} conflict${n === 1 ? '' : 's'} detected across sources` : 'Loading...'}
      </div>
      {loaded && n === 0 ? (
        <div className="text-center py-8 text-zinc-500 text-sm">No conflicts detected — all sources agree.</div>
      ) : (
        <div className="space-y-3">{conflicts.map((c, i) => <ConflictCard key={i} c={c} />)}</div>
      )}
      {n > 0 && (
        <div className="mt-6 p-5 rounded-2xl bg-[#34d399]/5 border border-[#34d399]/15">
          <div className="text-[12px] font-semibold text-[#34d399] mb-1">All other topics agree across sources</div>
          <div className="text-[11px] text-zinc-600">
            {agreed} topic{agreed === 1 ? '' : 's'} had consistent information in all uploaded documents.
          </div>
        </div>
      )}
    </div>
  );
}
