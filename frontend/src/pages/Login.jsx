import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { Brand } from '../components/Layout.jsx';

const inputCls =
  'w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-[14px] text-zinc-100 outline-none focus:border-[#7c6fff]/50';
const labelCls = 'block text-[11px] text-zinc-500 uppercase tracking-widest font-bold mb-1.5';

export default function Login() {
  const { isAuthed, login, register } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const next = loc.state?.from || '/';

  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAuthed) return <Navigate to={next} replace />;

  const switchMode = (m) => { setMode(m); setError(''); };

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') await register(name, email, password);
      else await login(email, password);
      navigate(next, { replace: true });
    } catch (ex) {
      setError(ex.message === 'Failed to fetch' ? "Can't reach the backend. Is it running (npm run dev)?" : ex.message);
      setBusy(false);
    }
  }

  const tab = (m) =>
    `flex-1 text-[13px] font-semibold py-2 rounded-lg transition-colors ${
      mode === m ? 'bg-[#7c6fff]/20 text-[#c4b5fd]' : 'text-zinc-500 hover:text-zinc-300'
    }`;

  return (
    <div className="relative min-h-screen">
      <div className="bg-grid fixed inset-0 pointer-events-none" />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-[400px]">
          <div className="flex items-center justify-center mb-8"><Brand size="lg" /></div>

          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-7">
            <div className="flex gap-1 p-1 bg-white/[0.04] rounded-xl mb-6">
              <button type="button" className={tab('login')} onClick={() => switchMode('login')}>Sign in</button>
              <button type="button" className={tab('register')} onClick={() => switchMode('register')}>Create account</button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className={labelCls}>Name (optional)</label>
                  <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                </div>
              )}
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'} required minLength={8}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className={`${inputCls} pr-12`}
                  />
                  <button
                    type="button" onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 p-1"
                  >
                    {showPw ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
                {mode === 'register' && <div className="text-[11px] text-zinc-600 mt-1.5">At least 8 characters.</div>}
              </div>
              {error && <div className="text-[13px] text-red-400">{error}</div>}
              <button
                type="submit" disabled={busy}
                className="w-full bg-gradient-to-r from-[#7c6fff] to-[#a78bfa] text-white font-semibold text-[14px] py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {mode === 'register' ? 'Create account' : 'Sign in'}
              </button>
            </form>
          </div>
          <p className="text-center text-[12px] text-zinc-600 mt-5">Your notes are saved to your account, so you can open them any time.</p>
        </div>
      </div>
    </div>
  );
}
