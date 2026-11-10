import axios from 'axios';

const TOKEN_KEY = 'jt-token';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/login')) onUnauthorized();
    // Blob responses (downloads) carry JSON errors as blobs; decode them for a useful message.
    if (error.response?.data instanceof Blob && error.response.data.type?.includes('json')) {
      try { error.response.data = JSON.parse(await error.response.data.text()); } catch { /* ignore */ }
    }
    return Promise.reject(error);
  },
);

/** Human-readable message from an axios error. */
export function errorMessage(err, fallback = 'Something went wrong') {
  if (err?.response?.data?.error?.message) return err.response.data.error.message;
  if (err?.code === 'ECONNABORTED') return 'The request timed out';
  if (err?.message === 'Network Error') return 'Cannot reach the server. Is the API running?';
  return fallback;
}

/** Downloads a protected file (auth header required) and triggers a browser save. */
export async function downloadFile(url, fallbackName, params) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const cd = res.headers['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/.exec(cd);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
