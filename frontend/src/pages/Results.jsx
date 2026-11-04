import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Navbar, Spinner } from '../components/Layout.jsx';
import { apiFetch, readError } from '../lib/api.js';
import NotesTab from '../results/NotesTab.jsx';
import ConflictsTab from '../results/ConflictsTab.jsx';
import { FlashcardsTab, QuizTab, RevisionTab } from '../results/StudyTabs.jsx';
import ChatTab from '../results/ChatTab.jsx';

const EMPTY_QUIZ = { mcq: [], short: [], long: [] };

function StatCard({ value, label, color }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
      <div className={`font-syne text-3xl font-bold mb-1 ${color}`}>{value}</div>
      <div className="text-[11px] text-zinc-600 uppercase tracking-wider font-bold">{label}</div>
    </div>
  );
}

export default function Results() {
  const params = useParams();
  let projectId = params.id;
  if (!projectId) { try { projectId = sessionStorage.getItem('docnexus_project_id'); } catch { projectId = null; } }

  const [tab, setTab] = useState('notes');
  const [load, setLoad] = useState({ state: 'loading', message: '' }); // loading | ready | processing | error
  const [project, setProject] = useState(null);
  const [notes, setNotes] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [quiz, setQuiz] = useState(EMPTY_QUIZ);
  const [revision, setRevision] = useState([]);
  const [studyStatus, setStudyStatus] = useState('loading'); // loading | generating | ready | error
  const [hasPapers, setHasPapers] = useState(false);
  const pollTimer = useRef(null);

  let topic = null;
  try { topic = sessionStorage.getItem('docnexus_topic'); } catch { /* ignore */ }

  const applyStudy = (d) => {
    setFlashcards(d.flashcards || []);
    setQuiz(d.quiz || EMPTY_QUIZ);
    setRevision(d.revision || []);
  };

  // flashcards / quiz / revision are generated in the background: poll until ready
  const pollStudy = useCallback(async () => {
    clearTimeout(pollTimer.current);
    try {
      const res = await apiFetch(`/projects/${projectId}/study-material-status`);
      const data = await res.json();
      if (data.studyMaterialStatus === 'ready') { applyStudy(data); setStudyStatus('ready'); return; }
      if (data.studyMaterialStatus === 'failed') { setStudyStatus('error'); return; }
      pollTimer.current = setTimeout(pollStudy, 3000);
    } catch (err) {
      console.error('[study poll]', err);
      pollTimer.current = setTimeout(pollStudy, 5000);
    }
  }, [projectId]);

  const loadResults = useCallback(async () => {
    setLoad({ state: 'loading', message: '' });
    try {
      const res = await apiFetch(`/projects/${projectId}/results`);
      if (res.status === 409) { setLoad({ state: 'processing', message: 'This project is still being processed.' }); return; }
      if (!res.ok) throw new Error(await readError(res, 'Failed to load results'));
      const data = await res.json();
      setProject(data.project || null);
      setNotes(data.notes || []);
      setConflicts(data.conflicts || []);
      applyStudy(data);
      setHasPapers(false);
      setLoad({ state: 'ready', message: '' });

      const status = data.project?.studyMaterialStatus;
      if (status && status !== 'ready') { setStudyStatus('generating'); pollStudy(); } else setStudyStatus('ready');
    } catch (err) {
      console.error('[loadResults]', err);
      setLoad({ state: 'error', message: `Couldn't load your results: ${err.message}` });
    }
  }, [projectId, pollStudy]);

  useEffect(() => {
    if (!projectId) return undefined;
    try { sessionStorage.setItem('docnexus_project_id', projectId); } catch { /* ignore */ }
    loadResults();
    return () => clearTimeout(pollTimer.current);
  }, [projectId, loadResults]);

  const nav = (
    <Navbar>
      {topic && <span className="text-[11px] px-3 py-1 rounded-full bg-[#7c6fff]/10 text-[#a78bfa] border border-[#7c6fff]/20 font-medium">{topic}</span>}
      <Link to="/projects" className="text-[12px] text-zinc-400 hover:text-zinc-100 transition-colors">My projects</Link>
      <Link to="/" className="text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        New fusion
      </Link>
    </Navbar>
  );

  if (!projectId) {
    return (
      <>
        {nav}
        <div className="max-w-[900px] mx-auto px-6 py-10 text-center py-24">
          <div className="text-zinc-400 text-sm mb-4">No active project found. Please upload your documents first.</div>
          <Link to="/" className="inline-block px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] text-white text-sm font-bold">Go to Upload</Link>
        </div>
      </>
    );
  }

  if (load.state === 'processing' || load.state === 'error') {
    return (
      <>
        {nav}
        <div className="max-w-[900px] mx-auto px-6 py-24 text-center">
          <div className="text-zinc-400 text-sm mb-1">{load.message}</div>
          {load.state === 'processing' ? (
            <>
              <div className="text-zinc-500 text-xs mt-2">Your documents are still being processed.</div>
              <Link to="/projects" className="inline-block mt-3 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] text-white text-xs font-bold">Back to my projects</Link>
            </>
          ) : (
            <button onClick={loadResults} className="inline-block mt-3 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] text-white text-xs font-bold">Try again</button>
          )}
        </div>
      </>
    );
  }

  const loaded = load.state === 'ready';
  const stats = project?.stats || {};
  const studyView = loaded ? studyStatus : 'loading';

  const tabs = [
    ['notes', '📄 Unified Notes'],
    ['conflicts', '⚠️ Conflicts'],
    ['flashcards', '🃏 Flashcards'],
    ['quiz', '📝 Quiz'],
    ['revision', '📋 Revision Sheet'],
    ['chat', '💬 Chat'],
  ];

  return (
    <>
      {nav}
      <div className="max-w-[900px] mx-auto px-6 py-10 animate-fade-up">
        <div className="mb-10">
          <div className="text-[11px] text-zinc-600 font-bold uppercase tracking-widest mb-3">Fusion Complete</div>
          <h1 className="font-syne text-2xl font-extrabold text-zinc-100 mb-6">Your knowledge base is ready.</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard value={loaded ? stats.topicsMerged ?? 0 : '–'} label="Topics merged" color="text-[#a78bfa]" />
            <StatCard value={loaded ? stats.duplicatesRemoved ?? 0 : '–'} label="Duplicates removed" color="text-[#34d399]" />
            <StatCard value={loaded ? stats.conflictsFound ?? 0 : '–'} label="Conflicts found" color="text-amber-400" />
            <StatCard value={loaded ? stats.sourcesUsed ?? 0 : '–'} label="Sources used" color="text-[#60a5fa]" />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-6">
          {tabs.map(([id, label]) => (
            <button
              key={id} onClick={() => setTab(id)}
              className={`text-[12px] font-semibold px-4 py-2 rounded-xl border transition-all duration-200 flex items-center gap-2 ${
                tab === id ? 'bg-[#7c6fff]/15 text-[#a78bfa] border-[#7c6fff]/30' : 'border-white/[0.06] text-zinc-400'
              }`}
            >
              {label}
              {id === 'conflicts' && <span className="bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0.5 rounded-full">{conflicts.length}</span>}
              {id === 'chat' && <span className="w-2 h-2 rounded-full bg-[#34d399] animate-pulse" />}
            </button>
          ))}
        </div>

        {!loaded && (
          <div className="text-center py-6 text-zinc-600 text-sm flex items-center justify-center gap-2"><Spinner /> Loading...</div>
        )}

        {/* every tab stays mounted (just hidden) so chat history and uploads survive tab switches */}
        <div className={tab === 'notes' ? 'animate-fade-up' : 'hidden'}>
          <NotesTab
            projectId={projectId} notes={notes} loaded={loaded} stats={stats}
            qpInitial={!!project?.hasQuestionPapers}
            onQpReady={() => setHasPapers(true)}
            onShowConflicts={() => setTab('conflicts')}
          />
        </div>
        <div className={tab === 'conflicts' ? 'animate-fade-up' : 'hidden'}>
          <ConflictsTab conflicts={conflicts} noteCount={notes.length} loaded={loaded} />
        </div>
        <div className={tab === 'flashcards' ? 'animate-fade-up' : 'hidden'}>
          <FlashcardsTab cards={flashcards} status={studyView} />
        </div>
        <div className={tab === 'quiz' ? 'animate-fade-up' : 'hidden'}>
          <QuizTab quiz={quiz} status={studyView} />
        </div>
        <div className={tab === 'revision' ? 'animate-fade-up' : 'hidden'}>
          <RevisionTab projectId={projectId} revision={revision} status={studyView} />
        </div>
        <div className={tab === 'chat' ? 'animate-fade-up' : 'hidden'}>
          {loaded && <ChatTab projectId={projectId} notes={notes} conflicts={conflicts} hasPapers={hasPapers} />}
        </div>
      </div>
    </>
  );
}
