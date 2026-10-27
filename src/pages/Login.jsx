import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet, LogIn, Clock, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-white px-3 py-6 dark:from-slate-950 dark:to-slate-900 sm:px-4 sm:py-8">
      {/* Theme switch is available before login too, so the sign-in screen can
          follow the persisted light/dark/system preference. */}
      <div className="absolute right-4 top-4">
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
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Username</label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
          >
            <LogIn size={16} /> {loading ? 'Logging in...' : 'Login'}
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
