import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAutoLogout } from '../hooks/useAutoLogout';
import IdleWarningModal from '../components/IdleWarningModal';

// Set when the server rejects the token (expired, revoked, forged). The next
// screen reads it and shows a matching banner; user-initiated logouts and
// idle timeouts carry their own notice, so this flag belongs to server-side
// rejections only.
export const markServerSessionExpired = () => {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('ledger_logout_reason', 'expired');
  } catch {
    /* non-fatal */
  }
};


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
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      // Tampered/corrupt JSON must not crash the app on boot - drop it.
      safeStorage.remove('ledger_admin');
      return null;
    }
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

  const signup = async (username, password, name, inviteCode) => {
    const res = await api.post('/auth/signup', { username, password, name, inviteCode });
    localStorage.setItem('ledger_token', res.data.token);
    localStorage.setItem('ledger_admin', JSON.stringify(res.data.admin));
    setToken(res.data.token);
    setAdmin(res.data.admin);
    return res.data;
  };

  const logout = useCallback((reason = '') => {
    localStorage.removeItem('ledger_token');
    localStorage.removeItem('ledger_admin');
    setToken(null);
    setAdmin(null);
    // The Login screen shows a matching banner for 'idle' / 'expired'; manual
    // Navbar logouts leave no trace so the plain form is shown instead.
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (reason) sessionStorage.setItem('ledger_logout_reason', reason);
        else sessionStorage.removeItem('ledger_logout_reason');
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  const navigate = useNavigate();

  // ── Auto logout on inactivity ──────────────────────────────────────────
  // Armed only while a session exists. All wiring lives inside the hook; the
  // provider just renders the warning dialog and calls the real logout.
  // `navigate` is in scope because AuthProvider mounts inside BrowserRouter.
  const handleIdleLogout = useCallback(() => {
    logout('idle');
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const { warningOpen, secondsLeft, extend } = useAutoLogout({
    timeoutInMinutes: 10,
    warningSeconds: 60,
    enabled: !!token,
    onLogout: handleIdleLogout,
  });

  return (
    <AuthContext.Provider value={{ admin, token, loading, login, signup, logout, isAuthenticated: !!token }}>
      {children}

      <IdleWarningModal
        open={warningOpen}
        secondsLeft={secondsLeft}
        onStay={extend}
        onLogoutNow={handleIdleLogout}
      />
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
