import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, LogIn, Clock, Lock, ShieldAlert, User, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { isRemembered } from '../utils/tokenStore';
import ThemeToggle from '../components/ThemeToggle';

/*
 * Field-level validation.
 * Mirrors the server rules (username 3-64 chars, password ≥ 8) so users get
 * instant feedback instead of a round-trip error, while the server stays the
 * final authority.
 */
const validateField = (name, value) => {
  switch (name) {
    case 'username': {
      const v = value.trim();
      if (!v) return 'Username is required';
      if (v.length < 3) return 'Username must be at least 3 characters';
      if (v.length > 64) return 'Username must be 64 characters or fewer';
      return '';
    }
    case 'password':
      if (!value) return 'Password is required';
      return '';
    default:
      return '';
  }
};

const networkErrorMessage =
  'Cannot reach the server. Check your internet connection and try again.';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();

  // Where the user was heading before the session gate bounced them here
  // (set by ProtectedRoute). Falls back to the dashboard.
  const from = useMemo(
    () => location.state?.from?.pathname || '/dashboard',
    [location.state]
  );

  const [form, setForm] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({}); // validate only after first blur
  const [error, setError] = useState(''); // form-level banner (server errors)
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => isRemembered());

  const submittedRef = useRef(false); // guards against double-submit

  // After a forced logout (inactivity timeout or rejected token) AuthProvider /
  // the axios interceptor leaves a one-shot reason flag behind. Surface the
  // matching banner, then clear it so a refresh shows the plain form again.
  const [logoutNotice, setLogoutNotice] = useState(null);
  useEffect(() => {
    let reason = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        reason = sessionStorage.getItem('ledger_logout_reason');
        sessionStorage.removeItem('ledger_logout_reason');
      }
    } catch {
      reason = null;
    }
    setLogoutNotice(reason === 'idle' ? 'idle' : reason === 'expired' ? 'expired' : null);
  }, []);

  useEffect(() => () => { submittedRef.current = false; }, []);

  const handleChange = useCallback((name, value) => {
    // Auto-trim usernames/emails so a stray trailing space never fails login.
    const nextValue = name === 'password' ? value : value.replace(/\s+/g, '');
    setForm((prev) => ({ ...prev, [name]: nextValue }));
    if (touched[name]) {
      setErrors((prev) => ({ ...prev, [name]: validateField(name, nextValue) }));
    }
  }, [touched]);

  const handleBlur = useCallback((name) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, form[name]) }));
  }, [form]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (submittedRef.current || loading) return;

    // Validate everything up front; focus the first invalid field.
    const fieldErrors = {
      username: validateField('username', form.username),
      password: validateField('password', form.password),
    };
    setErrors(fieldErrors);
    setTouched({ username: true, password: true });
    if (fieldErrors.username || fieldErrors.password) return;

    setError('');
    setLoading(true);
    submittedRef.current = true;

    try {
      await login(form.username, form.password, remember);
      toast.showToast(`Welcome${form.username ? `, ${form.username.trim()}` : ''}! You're signed in.`, 'success', 'Login Successful');
      // Smooth redirect to the intended route (or the dashboard).
      navigate(from, { replace: true });
    } catch (err) {
      submittedRef.current = false; // allow a retry
      if (err.request && !err.response) {
        toast.showToast(networkErrorMessage, 'error', 'Network Error');
        setError(networkErrorMessage);
      } else {
        const message = err.response?.data?.message || 'Invalid username or password';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (name) => {
    const invalid = touched[name] && errors[name];
    return `w-full rounded-xl border bg-surface py-3 pl-10 text-base text-ink placeholder:text-ink-faint shadow-sm transition-colors duration-150 focus:outline-none focus:ring-2 dark:bg-slate-800/60 ${
      invalid
        ? 'border-red-400 focus:border-red-500 focus:ring-red-500/25'
        : 'border-line-strong focus:border-brand-500 focus:ring-brand-500/25'
    }`;
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 to-white px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(6rem+env(safe-area-inset-top))] dark:from-slate-950 dark:to-slate-900 sm:px-4 sm:pt-24">
      {/* Theme switch is available before login too, so the sign-in screen can
          follow the persisted light/dark/system preference. */}
      <div className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] sm:top-4">
        <ThemeToggle showLabels />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="p-3 bg-brand-600 text-white rounded-xl mb-3">
            <Wallet size={28} />
          </div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-slate-100">Financial Ledger Tracker</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">Admin Login</p>
        </div>

        {logoutNotice === 'idle' && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300" role="status">
            <Clock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>You were logged out due to inactivity. Please log in again.</span>
          </div>
        )}

        {logoutNotice === 'expired' && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" role="status">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>Your session expired. Please log in again.</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="animate-fade-slide-down mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* noValidate keeps iOS Safari from stocking its own yellow bubbles on
            top of the inline validation below. */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="login-username" className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">
              Username
            </label>
            <div className="relative">
              <User size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                id="login-username"
                value={form.username}
                onChange={(e) => handleChange('username', e.target.value)}
                onBlur={() => handleBlur('username')}
                className={inputClass('username')}
                placeholder="admin"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="next"
                disabled={loading}
                aria-invalid={Boolean(touched.username && errors.username)}
                aria-describedby={touched.username && errors.username ? 'login-username-error' : undefined}
              />
            </div>
            {touched.username && errors.username && (
              <p id="login-username-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                {errors.username}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">
              Password
            </label>
            <div className="relative">
              <Lock size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                onBlur={() => handleBlur('password')}
                className={`${inputClass('password')} pr-11`}
                autoComplete="current-password"
                placeholder="••••••••"
                enterKeyHint="go"
                disabled={loading}
                aria-invalid={Boolean(touched.password && errors.password)}
                aria-describedby={touched.password && errors.password ? 'login-password-error' : undefined}
              />
              {/* Password visibility toggle — 44px tap target for touch. */}
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 hover:text-ink active:scale-90 active:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                tabIndex={-1} // keep Tab order on the password field itself
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            {touched.password && errors.password && (
              <p id="login-password-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                {errors.password}
              </p>
            )}
          </div>

          {/* Remember me — persistent session (localStorage) vs per-tab session. */}
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="login-remember"
              className="flex min-h-[44px] flex-1 cursor-pointer select-none items-center gap-2.5 text-sm text-gray-700 dark:text-slate-300"
            >
              <input
                id="login-remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-5 w-5 shrink-0 cursor-pointer rounded border-gray-300 text-brand-600 accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
              />
              <span>Remember me on this device</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-base font-semibold text-white shadow-md shadow-brand-600/25 transition-colors duration-150 hover:bg-brand-700 active:scale-[0.98] active:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
            aria-busy={loading}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                Logging in…
              </>
            ) : (
              <>
                <LogIn size={18} aria-hidden="true" /> Login
              </>
            )}
          </button>
        </form>

        <p className="text-sm text-center text-gray-500 dark:text-slate-400 mt-6">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="text-brand-700 font-medium no-underline hover:no-underline dark:text-brand-400">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
