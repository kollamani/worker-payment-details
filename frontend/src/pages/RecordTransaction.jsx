import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, ShieldCheck, CalendarDays } from 'lucide-react';
import Navbar from '../components/Navbar';
import TransactionForm from '../components/TransactionForm';
import api from '../api/axios';
import { todayKey } from '../utils/dates';

const RecordTransaction = () => {
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');

  const fetchMembers = async () => {
    try {
      const res = await api.get('/members');
      setMembers(res.data.members);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load members');
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleSubmit = async (data) => {
    await api.post('/transactions', data);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Record Transaction</h1>
          <p className="mt-1 text-sm text-slate-500">
            Log a new deposit or received/withdrawal amount. Date defaults to {todayKey()}.
          </p>
        </div>

        {error && (
          <div className="mb-4 max-w-xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-600">
              No members found. Please add a member first from{' '}
              <Link to="/members" className="font-medium text-brand-700 no-underline hover:no-underline">
                Manage Members
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <TransactionForm members={members} onSubmit={handleSubmit} />
            <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Workflow notes</p>
                <ul className="mt-3 space-y-3 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <Wallet size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    Deposit allocates 50% of the base amount as spendable balance.
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0 text-amber-600" />
                    Withdrawals cannot exceed remaining deposit balance.
                  </li>
                  <li className="flex gap-2">
                    <CalendarDays size={16} className="mt-0.5 shrink-0 text-slate-500" />
                    Dates are stored as YYYY-MM-DD with no timezone shift.
                  </li>
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-900 p-4 text-sm text-slate-200 shadow-sm">
                <p className="font-semibold text-white">{members.length} member(s) ready</p>
                <p className="mt-1 text-slate-400">Village auto-fills from the selected member. You can still edit it before saving.</p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};

export default RecordTransaction;
