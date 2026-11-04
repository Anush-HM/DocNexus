import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API, clearAuth, readAuth, saveAuth } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => readAuth());

  // apiFetch fires this when the server says the token is no longer valid
  useEffect(() => {
    const onLogout = () => setAuth(null);
    window.addEventListener('docnexus:logout', onLogout);
    return () => window.removeEventListener('docnexus:logout', onLogout);
  }, []);

  const submit = useCallback(async (mode, body) => {
    const res = await fetch(`${API}/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    saveAuth(data.token, data.user);
    setAuth({ token: data.token, user: data.user });
  }, []);

  const value = useMemo(() => ({
    user: auth?.user || null,
    isAuthed: !!auth?.token,
    login: (email, password) => submit('login', { email, password }),
    register: (name, email, password) => submit('register', { name, email, password }),
    logout: () => { clearAuth(); setAuth(null); },
  }), [auth, submit]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
