import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/endpoints.js';
import { tokenStore, setUnauthorizedHandler } from '../api/client.js';

const AuthContext = createContext(null);

// The signed-in user's profile, cached so a returning visit can render immediately instead of
// waiting for /auth/me first (a full extra server round trip on every page load). The session is
// still verified in the background, and any 401 signs the user out.
const USER_KEY = 'jt-user';
const userCache = {
  get: () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } },
  set: (u) => { try { if (u) localStorage.setItem(USER_KEY, JSON.stringify(u)); else localStorage.removeItem(USER_KEY); } catch { /* ignore */ } },
};

export function AuthProvider({ children }) {
  const [cached] = useState(() => (tokenStore.get() ? userCache.get() : null));
  const [user, setUserState] = useState(cached);
  // Only block rendering when there's a token but nothing cached (first visit on this device).
  const [loading, setLoading] = useState(Boolean(tokenStore.get()) && !cached);

  const setUser = useCallback((u) => { userCache.set(u); setUserState(u); }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    userCache.set(null);
    setUserState(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    authApi.me()
      .then(({ user: u }) => setUser(u))
      // 401s already sign out via the API client. Other failures (offline, server waking up) only
      // sign out when there's no cached profile to fall back on.
      .catch(() => { if (!cached) logout(); })
      .finally(() => setLoading(false));
  }, [logout, setUser, cached]);

  const handleAuth = useCallback(({ token, user: u }) => {
    tokenStore.set(token);
    setUser(u);
    return u;
  }, [setUser]);

  const value = useMemo(() => ({
    user,
    loading,
    login: (body) => authApi.login(body).then(handleAuth),
    register: (body) => authApi.register(body).then(handleAuth),
    logout,
    setUser,
  }), [user, loading, logout, setUser, handleAuth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
