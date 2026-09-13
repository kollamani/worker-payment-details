import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import TransactionForm from '../components/TransactionForm';
import api from '../api/axios';

const today = () => new Date().toISOString().slice(0, 10);

const RecordTransaction = () => {
  const [members, setMembers] = useState([]);
  const [recent, setRecent] = useState([]);
  const [depositTransactions, setDepositTransactions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [error, setError] = useState('');

  const fetchMembers = async () => {
    try {
      const res = await api.get('/members');
      setMembers(res.data.members);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load members');
    }
  };

  const fetchRecent = async () => {
    try {
      const res = await api.get('/transactions');
      setRecent(res.data.transactions.slice(0, 8));
    } catch (err) {
      // silent - non-critical
    }
  };

  const fetchDepositTransactions = async (date = selectedDate) => {
    try {
      const res = await api.get('/transactions');
      const targetDate = date || today();
      const filtered = res.data.transactions.filter((t) => {
        const transactionDate = new Date(t.date).toISOString().slice(0, 10);
        return t.type === 'deposit' && transactionDate === targetDate;
      });
      setDepositTransactions(filtered);
    } catch (err) {
      setDepositTransactions([]);
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchRecent();
  }, []);

  useEffect(() => {
    fetchDepositTransactions(selectedDate);
  }, [selectedDate]);

  const handleSubmit = async (data) => {
    await api.post('/transactions', data);
    fetchRecent();
    fetchDepositTransactions(selectedDate);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Record Transaction</h1>
        <p className="text-sm text-gray-500 mb-6">Log a new deposit or received/withdrawal amount for a member</p>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-w-xl">
            {error}
          </div>
        )}

        {members.length === 0 ? (
          <div className="text-sm text-gray-500 bg-white border border-dashed border-gray-300 rounded-xl p-6 max-w-xl">
            No members found. Please add a member first from{' '}
            <span className="font-medium text-brand-700">Manage Members</span>.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <TransactionForm members={members} onSubmit={handleSubmit} />

            <div>
              <h2 className="text-sm font-semibold text-gray-600 uppercase mb-3">Recent Transactions</h2>
              <div className="bg-white rounded-xl border border-gray-200 divide-y">
                {recent.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">No transactions recorded yet.</p>
                ) : (
                  recent.map((t) => (
                    <div key={t._id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {t.member?.name} <span className="text-gray-400">({t.member?.jNo})</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(t.date).toLocaleDateString('en-IN')} {t.note && `— ${t.note}`}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          t.type === 'deposit' ? 'text-green-700' : 'text-amber-700'
                        }`}
                      >
                        {t.type === 'deposit' ? '+' : '-'}₹{t.amount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-gray-600 uppercase">Deposit Records</h2>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <label htmlFor="deposit-date" className="font-medium">
                      Date
                    </label>
                    <input
                      id="deposit-date"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value || today())}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 divide-y">
                  {depositTransactions.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">
                      No deposit transactions recorded for this date.
                    </p>
                  ) : (
                    depositTransactions.map((t) => (
                      <div key={t._id} className="p-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800">
                            {t.member?.name || 'Member'} <span className="text-gray-400">({t.member?.jNo || '—'})</span>
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(t.date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}{' '}
                            {new Date(t.date).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {t.note ? ` • ${t.note}` : ''}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-green-700">+₹{t.amount.toLocaleString('en-IN')}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default RecordTransaction;
