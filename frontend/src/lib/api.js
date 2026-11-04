// Backend address. In development Vite proxies "/api" to http://localhost:5000;
// in production the backend serves this app, so "/api" is the same origin.
// Override with VITE_API_URL (for example https://my-host/api) if the API lives elsewhere.
export const API = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

const KEY = 'docnexus_auth';

export function readAuth() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
export function saveAuth(token, user) {
  try { localStorage.setItem(KEY, JSON.stringify({ token, user })); } catch { /* storage blocked */ }
}
export function clearAuth() {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem('docnexus_project_id'); } catch { /* ignore */ }
}

// fetch() for the projects API: adds the login token and signs the user out when it expires.
export async function apiFetch(path, init = {}) {
  const auth = readAuth();
  const headers = new Headers(init.headers || {});
  if (auth?.token) headers.set('Authorization', `Bearer ${auth.token}`);
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (res.status === 401 && auth?.token) {
    clearAuth();
    window.dispatchEvent(new Event('docnexus:logout'));
  }
  return res;
}

export async function readError(res, fallback) {
  try { return (await res.json()).error || fallback; } catch { return fallback; }
}

export const isNetworkError = (err) => err instanceof TypeError;

export function escapeHtml(text) {
  if (text == null) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
