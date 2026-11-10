import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/endpoints.js';
import { tokenStore, setUnauthorizedHandler } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    authApi.me()
      .then(({ user: u }) => setUser(u))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const handleAuth = ({ token, user: u }) => {
    tokenStore.set(token);
    setUser(u);
    return u;
  };

  const value = useMemo(() => ({
    user,
    loading,
    login: (body) => authApi.login(body).then(handleAuth),
    register: (body) => authApi.register(body).then(handleAuth),
    logout,
    setUser,
  }), [user, loading, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
