import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Wallet, UserPlus, Loader2 } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';

const Signup = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';
  const [form, setForm] = useState({ username: '', password: '', name: '', inviteCode: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupLocked, setSignupLocked] = useState(false);
  const [inviteRequired, setInviteRequired] = useState(false);

  useEffect(() => {
    const fetchSignupStatus = async () => {
      try {
        const res = await api.get('/auth/signup-status');
        if (res.data.limitReached) {
          setSignupLocked(true);
          setError('Registration is closed: the maximum number of accounts already exists.');
        }
        if (res.data.inviteRequired) {
          setInviteRequired(true);
        }
      } catch (err) {
        // Ignore status fetch issues; login and signup can still proceed if backend is reachable.
      }
    };

    fetchSignupStatus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading) return; // guard against double-submit taps

    setError('');

    if (signupLocked) {
      setError('Registration is closed: the maximum number of accounts already exists.');
      return;
    }

    if (form.password.length < 8 || !/\d/.test(form.password)) {
      setError('Password must be at least 8 characters and contain a digit');
      return;
    }
    if (inviteRequired && !form.inviteCode.trim()) {
      setError('Invite code is required');
      return;
    }

    setLoading(true);
    try {
      // Account creation always yields a persistent session (remember me).
      await signup(form.username, form.password, form.name, form.inviteCode.trim(), true);
      // Return to the route the user was originally heading for.
      navigate(from, { replace: true });
    } catch (err) {
      const message = err.response?.data?.message || 'Signup failed';
      if (message.includes('Maximum user limit')) {
        setSignupLocked(true);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 to-white px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(6rem+env(safe-area-inset-top))] dark:from-slate-950 dark:to-slate-900 sm:px-4 sm:pt-24">
      {/* Theme switch is available before sign-up too, so the screen follows the
          persisted light/dark/system preference on first visit. */}
      <div className="absolute right-4 top-4">
        <ThemeToggle showLabels />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="p-3 bg-brand-600 text-white rounded-xl mb-3">
            <Wallet size={28} />
          </div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-slate-100">Financial Ledger Tracker</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">Create Admin Account</p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {signupLocked ? (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300">
            Registration is currently disabled because the maximum number of allowed accounts has been reached.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Full Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Username</label>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="Choose a username"
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
                placeholder="At least 8 characters with a digit"
                autoComplete="new-password"
              />
            </div>
            {inviteRequired && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">Invite Code</label>
                <input
                  value={form.inviteCode}
                  onChange={(e) => setForm({ ...form, inviteCode: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder="Enter the invite code"
                  autoComplete="off"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-base font-semibold text-white shadow-md shadow-brand-600/25 transition-colors duration-150 hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Creating account…
                </>
              ) : (
                <>
                  <UserPlus size={18} aria-hidden="true" /> Sign Up
                </>
              )}
            </button>
          </form>
        )}

        <p className="text-sm text-center text-gray-500 dark:text-slate-400 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-700 font-medium no-underline hover:no-underline dark:text-brand-400">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
