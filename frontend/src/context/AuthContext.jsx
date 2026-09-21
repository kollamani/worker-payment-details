import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Safe storage access: localStorage does not exist outside the browser
  // (e.g. an SSR/isolated render), so guard every touch to avoid a hard crash.
  const safeStorage = {
    get: (key) => {
      try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      } catch {
        /* storage full / disabled — non-fatal */
      }
    },
    remove: (key) => {
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      } catch {
        /* non-fatal */
      }
    },
  };

  const [admin, setAdmin] = useState(() => {
    const stored = safeStorage.get('ledger_admin');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState(() => safeStorage.get('ledger_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const storedToken = localStorage.getItem('ledger_token');
      if (storedToken) {
        try {
          const res = await api.get('/auth/me');
          setAdmin(res.data.admin);
          localStorage.setItem('ledger_admin', JSON.stringify(res.data.admin));
        } catch (err) {
          localStorage.removeItem('ledger_token');
          localStorage.removeItem('ledger_admin');
          setToken(null);
          setAdmin(null);
        }
      }
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    localStorage.setItem('ledger_token', res.data.token);
    localStorage.setItem('ledger_admin', JSON.stringify(res.data.admin));
    setToken(res.data.token);
    setAdmin(res.data.admin);
    return res.data;
  };

  const signup = async (username, password, name) => {
    const res = await api.post('/auth/signup', { username, password, name });
    localStorage.setItem('ledger_token', res.data.token);
    localStorage.setItem('ledger_admin', JSON.stringify(res.data.admin));
    setToken(res.data.token);
    setAdmin(res.data.admin);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('ledger_token');
    localStorage.removeItem('ledger_admin');
    setToken(null);
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ admin, token, loading, login, signup, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
