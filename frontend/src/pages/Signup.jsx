import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet, UserPlus } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const Signup = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupLocked, setSignupLocked] = useState(false);

  useEffect(() => {
    const fetchSignupStatus = async () => {
      try {
        const res = await api.get('/auth/signup-status');
        if (res.data.limitReached) {
          setSignupLocked(true);
          setError('Maximum user limit reached (Max 2 users allowed)');
        }
      } catch (err) {
        // Ignore status fetch issues; login and signup can still proceed if backend is reachable.
      }
    };

    fetchSignupStatus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (signupLocked) {
      setError('Maximum user limit reached (Max 2 users allowed)');
      return;
    }

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await signup(form.username, form.password, form.name);
      navigate('/dashboard');
    } catch (err) {
      const message = err.response?.data?.message || 'Signup failed';
      if (message === 'Maximum user limit reached (Max 2 users allowed)') {
        setSignupLocked(true);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-white px-3 py-6 sm:px-4 sm:py-8">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-5 shadow-xl sm:p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="p-3 bg-brand-600 text-white rounded-xl mb-3">
            <Wallet size={28} />
          </div>
          <h1 className="text-xl font-bold text-gray-800">Financial Ledger Tracker</h1>
          <p className="text-sm text-gray-500">Create Admin Account</p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {signupLocked ? (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
            Registration is currently disabled because the maximum number of allowed accounts has been reached.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                placeholder="Choose a username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                placeholder="At least 6 characters"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
            >
              <UserPlus size={16} /> {loading ? 'Creating account...' : 'Sign Up'}
            </button>
          </form>
        )}

        <p className="text-sm text-center text-gray-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-700 font-medium no-underline hover:no-underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
