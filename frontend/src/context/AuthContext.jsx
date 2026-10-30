import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAutoLogout } from '../hooks/useAutoLogout';
import IdleWarningModal from '../components/IdleWarningModal';
import { clearTokens, getAdmin, getToken, setAdmin, setTokens } from '../utils/tokenStore';

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
  const [admin, setAdmin] = useState(() => getAdmin());
  const [token, setToken] = useState(() => getToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      // Remember-me aware: reads localStorage first, then sessionStorage.
      const storedToken = getToken();
      if (storedToken) {
        try {
          const res = await api.get('/auth/me');
          setAdmin(res.data.admin);
        } catch (err) {
          // 401 already triggers the interceptor's cleanup + redirect; for
          // any other failure (e.g. network down) keep the stored profile so
          // the UI still renders and the next request retries silently.
          if (err.response?.status !== 401) {
            setAdmin(getAdmin());
          }
        }
      }
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistSession = useCallback((data, remember) => {
    setTokens({ token: data.token, admin: data.admin, remember });
    setToken(data.token);
    setAdmin(data.admin);
    return data;
  }, []);

  const login = async (username, password, remember = true) => {
    const res = await api.post('/auth/login', {
      username: String(username ?? '').trim(),
      password,
      remember,
    });
    return persistSession(res.data, remember);
  };

  const signup = async (username, password, name, inviteCode, remember = true) => {
    const res = await api.post('/auth/signup', {
      username: String(username ?? '').trim(),
      password,
      name,
      inviteCode,
      remember,
    });
    return persistSession(res.data, remember);
  };

  const logout = useCallback((reason = '') => {
    // Clears localStorage AND sessionStorage so no stale token can survive a
    // remember-me compartment switch.
    clearTokens();
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
