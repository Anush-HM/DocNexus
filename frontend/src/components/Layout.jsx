import { Link, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';

export function Brand({ size = 'sm' }) {
  const big = size === 'lg';
  return (
    <span className="flex items-center gap-2.5">
      <img src="/logo.jpg" alt="DocNexus" className={`${big ? 'h-11 w-11' : 'h-9 w-9'} rounded-lg bg-white object-cover`} />
      <span className={`font-syne ${big ? 'text-[20px]' : 'text-[17px]'} font-extrabold tracking-tight`}>
        Doc<span className="text-[#a78bfa]">Nexus</span>
      </span>
    </span>
  );
}

export function Spinner({ className = '' }) {
  return (
    <svg className={`animate-spin ${className}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}

function UserBox() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-zinc-500 hidden sm:inline">{user.name || user.email}</span>
      <button
        onClick={() => { logout(); navigate('/login'); }}
        className="text-[11px] text-zinc-500 hover:text-zinc-200 border border-white/10 rounded-lg px-2.5 py-1 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

export function Navbar({ children }) {
  return (
    <nav className="flex items-center justify-between px-6 md:px-10 py-4 border-b border-white/5 sticky top-0 bg-[#0a0a0f]/85 backdrop-blur-xl z-[100]">
      <Link to="/" className="hover:opacity-80 transition-opacity"><Brand /></Link>
      <div className="flex items-center gap-3">
        {children}
        <UserBox />
      </div>
    </nav>
  );
}

// Everything except /login needs an account.
export default function ProtectedLayout() {
  const { isAuthed } = useAuth();
  const loc = useLocation();
  if (!isAuthed) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return (
    <div className="relative min-h-screen">
      <div className="bg-grid fixed inset-0 pointer-events-none z-0" />
      <div className="relative z-10"><Outlet /></div>
    </div>
  );
}
