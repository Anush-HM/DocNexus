import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Layout.jsx';
import { apiFetch, readError } from '../lib/api.js';

function statusChip(p) {
  if (p.status === 'ready') return ['Ready', 'text-[#34d399] bg-[#34d399]/10'];
  if (p.status === 'failed') return ['Failed', 'text-red-400 bg-red-500/10'];
  const pct = p.progress && p.progress.pct != null ? ` ${p.progress.pct}%` : '';
  return [`Processing${pct}`, 'text-amber-400 bg-amber-500/10'];
}

function ProjectCard({ p, onDelete }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const ready = p.status === 'ready';
  const [label, chipCls] = statusChip(p);
  const date = new Date(p.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const files = p.files || [];
  const mats = files.filter((f) => f.type === 'material').map((f) => f.name);
  const qps = files.filter((f) => f.type === 'question_paper').length;

  async function downloadPdf() {
    setBusy(true);
    try {
      const res = await apiFetch(`/projects/${p.id}/export/notes`);
      if (!res.ok) throw new Error(await readError(res, 'PDF unavailable'));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = 'DocNexus-Unified-Notes.pdf'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm('Delete this project and all its notes? This cannot be undone.')) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/projects/${p.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, 'Delete failed'));
      onDelete(p.id);
    } catch (e) { alert(e.message); setBusy(false); }
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${chipCls}`}>{label}</span>
          <span className="text-[11px] text-zinc-600">{date}</span>
        </div>
        <div className="text-[15px] font-semibold text-zinc-100 truncate">{p.title}</div>
        <div className="text-[12px] text-zinc-500 mt-1 truncate">
          {mats.join(' · ')}{qps ? ` · ${qps} question paper${qps > 1 ? 's' : ''}` : ''}
        </div>
        {ready && p.stats && (
          <div className="text-[12px] text-zinc-600 mt-1">
            {p.stats.topicsMerged} topics · {p.stats.duplicatesRemoved} duplicates removed · {p.stats.conflictsFound} conflicts
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {ready && (
          <>
            <button onClick={() => navigate(`/results/${p.id}`)} className="text-[12px] font-semibold bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] px-3.5 py-2 rounded-lg hover:opacity-90">Open</button>
            <button onClick={downloadPdf} disabled={busy} className="text-[12px] text-zinc-300 border border-white/10 px-3 py-2 rounded-lg hover:bg-white/5 disabled:opacity-50">PDF</button>
          </>
        )}
        <button onClick={remove} disabled={busy} className="text-[12px] text-zinc-500 hover:text-red-400 border border-white/10 px-3 py-2 rounded-lg disabled:opacity-50">Delete</button>
      </div>
    </div>
  );
}

export default function Projects() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch('/projects');
      if (!res.ok) throw new Error(await readError(res, 'Could not load your projects'));
      setProjects((await res.json()).projects || []);
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? "Can't reach the backend. Is it running (npm run dev)?" : e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Navbar>
        <Link to="/" className="text-[12px] font-semibold bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] px-3.5 py-1.5 rounded-lg hover:opacity-90">+ New fusion</Link>
      </Navbar>
      <div className="max-w-[900px] mx-auto px-6 py-10">
        <div className="text-[11px] text-zinc-600 font-bold uppercase tracking-widest mb-2">Saved to your account</div>
        <h1 className="font-syne text-2xl font-extrabold text-zinc-100 mb-8">My projects</h1>

        {error ? (
          <div className="text-red-400 text-sm py-10 text-center">{error}</div>
        ) : projects === null ? (
          <div className="animate-pulse space-y-3">
            <div className="h-[92px] rounded-2xl bg-white/[0.03] border border-white/[0.05]" />
            <div className="h-[92px] rounded-2xl bg-white/[0.03] border border-white/[0.05]" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl">
            <div className="text-zinc-400 mb-4">No projects yet.</div>
            <Link to="/" className="text-[13px] font-semibold bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] px-4 py-2 rounded-lg">Create your first fusion</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} p={p} onDelete={(id) => setProjects((list) => list.filter((x) => x.id !== id))} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
