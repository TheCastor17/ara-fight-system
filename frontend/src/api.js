const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000');
let accessToken = sessionStorage.getItem('access_token');
let refreshToken = sessionStorage.getItem('refresh_token');

export function saveSession(session) {
  accessToken = session?.access_token || null;
  refreshToken = session?.refresh_token || null;
  if (accessToken) sessionStorage.setItem('access_token', accessToken);
  else sessionStorage.removeItem('access_token');
  if (refreshToken) sessionStorage.setItem('refresh_token', refreshToken);
  else sessionStorage.removeItem('refresh_token');
}

export function clearSession() { saveSession(null); }
export const hasSession = () => Boolean(accessToken);

async function request(path, options = {}, retry = true) {
  const headers = {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...options.headers
  };

  // ✅ Construcción segura de la URL (sin espacios ni barras duplicadas)
  const url = `${API}${path}`;

  const response = await fetch(url, {
    ...options,
    headers,
    body: options.body !== undefined && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body
  });

  // Refresh automático si el token expiró
  if (response.status === 401 && retry && refreshToken && !path.includes('/auth/')) {
    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (r.ok) {
      const d = await r.json();
      saveSession(d.session);
      return request(path, options, false);
    }
    clearSession();
  }

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `HTTP_${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),

  login: (email, password) => request('/auth/login', {
    method: 'POST',
    body: { email, password }
  }, false)
};