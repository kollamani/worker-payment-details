import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  PiggyBank,
  Scale,
  ArrowDownCircle,
  ArrowUpCircle,
  Pencil,
  Trash2,
  X,
  Save,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import MetricCard from '../components/MetricCard';
import ConfirmModal from '../components/ConfirmModal';
import api from '../api/axios';

const UserDetail = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editingForm, setEditingForm] = useState({
    date: '',
    type: 'deposit',
    amount: '',
    note: '',
    villageName: '',
  });
  const [editingError, setEditingError] = useState('');
  const [actionLoading, setActionLoading] = useState({});

  const fetchSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/members/${id}/summary`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load member summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [id]);

  const submitDelete = async () => {
    if (!transactionToDelete) return;

    setActionLoading((prev) => ({ ...prev, [transactionToDelete.id]: 'delete' }));
    try {
      await api.delete(`/transactions/${transactionToDelete.id}`);
      setSuccess('Transaction deleted successfully.');
      setTransactionToDelete(null);
      await fetchSummary();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete transaction');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[transactionToDelete.id];
        return next;
      });
    }
  };

  const openEditModal = (transaction) => {
    setEditingError('');
    setEditingTransaction(transaction);
    setEditingForm({
      date: transaction.date ? new Date(transaction.date).toISOString().slice(0, 10) : '',
      type: transaction.type || 'deposit',
      amount: transaction.amount ?? '',
      note: transaction.note || '',
      villageName: transaction.villageName || data?.member?.villageName || '',
    });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditingForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditingError('');

    if (!editingTransaction) return;
    if (!editingForm.date) {
      setEditingError('Please select a date');
      return;
    }
    if (!editingForm.amount || Number(editingForm.amount) <= 0) {
      setEditingError('Amount must be greater than 0');
      return;
    }
    if (!['deposit', 'withdrawal'].includes(editingForm.type)) {
      setEditingError('Please select a valid transaction type');
      return;
    }

    setActionLoading((prev) => ({ ...prev, [editingTransaction.id]: 'edit' }));
    try {
      await api.put(`/transactions/${editingTransaction.id}`, {
        date: editingForm.date,
        type: editingForm.type,
        amount: Number(editingForm.amount),
        note: editingForm.note || '',
        villageName: editingForm.villageName || data?.member?.villageName || '',
      });
      setSuccess('Transaction updated successfully.');
      setEditingTransaction(null);
      setEditingForm({
        date: '',
        type: 'deposit',
        amount: '',
        note: '',
        villageName: '',
      });
      await fetchSummary();
    } catch (err) {
      setEditingError(err.response?.data?.message || 'Failed to update transaction');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[editingTransaction.id];
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link to="/users" className="flex items-center gap-1 text-sm text-brand-700 hover:underline mb-4 w-fit">
          <ArrowLeft size={16} /> Back to user list
        </Link>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            {success}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : data ? (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-800">{data.member.name}</h1>
              <p className="text-sm text-gray-500">
                J.No: {data.member.jNo} • Village: {data.member.villageName || '—'} • Created By Worker: {data.member.createdByWorker || '—'}
                {data.member.phone && ` • Phone: ${data.member.phone}`}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <MetricCard label="Total Amount" value={data.summary.totalDeposited} icon={PiggyBank} color="green" />
              <MetricCard label="Half Value" value={data.summary.halfAmount} icon={Scale} color="blue" />
              <MetricCard label="Total Received" value={data.summary.totalWithdrawn} icon={ArrowDownCircle} color="green" />
              <MetricCard label="Net Pending" value={data.summary.pendingBalance} icon={Scale} color="red" />
            </div>

            <h2 className="text-sm font-semibold text-gray-600 uppercase mb-3">Ledger Timeline</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y">
              {data.timeline.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">No transactions recorded for this member yet.</p>
              ) : (
                data.timeline
                  .slice()
                  .reverse()
                  .map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-4 p-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`p-2 rounded-full ${
                            t.type === 'deposit' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {t.type === 'deposit' ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800">
                            {t.type === 'deposit' ? 'Deposit' : 'Received / Withdrawal'}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {new Date(t.date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                            {t.villageName && ` • Village: ${t.villageName}`}
                            {t.note && ` — ${t.note}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            t.type === 'deposit' ? 'text-green-700' : 'text-amber-700'
                          }`}
                        >
                          {t.type === 'deposit' ? '+' : '-'}₹{t.amount.toLocaleString('en-IN')}
                        </span>

                        <button
                          type="button"
                          onClick={() => openEditModal(t)}
                          disabled={actionLoading[t.id] === 'edit' || actionLoading[t.id] === 'delete'}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                        >
                          <Pencil size={14} />
                          {actionLoading[t.id] === 'edit' ? 'Saving...' : 'Edit'}
                        </button>

                        <button
                          type="button"
                          onClick={() => setTransactionToDelete(t)}
                          disabled={actionLoading[t.id] === 'edit' || actionLoading[t.id] === 'delete'}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          <Trash2 size={14} />
                          {actionLoading[t.id] === 'delete' ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </>
        ) : null}

        <ConfirmModal
          open={!!transactionToDelete}
          title="Delete transaction"
          message={`Are you sure you want to delete this transaction for ${data?.member?.name || 'this member'}? This will also update the member balance.`}
          confirmLabel={actionLoading[transactionToDelete?.id] === 'delete' ? 'Deleting...' : 'Delete'}
          onConfirm={submitDelete}
          onCancel={() => setTransactionToDelete(null)}
        />

        {editingTransaction && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Edit Transaction</h3>
                <button
                  type="button"
                  onClick={() => setEditingTransaction(null)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close edit modal"
                >
                  <X size={18} />
                </button>
              </div>

              {editingError && (
                <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {editingError}
                </div>
              )}

              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      name="date"
                      value={editingForm.date}
                      onChange={handleEditChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      name="amount"
                      value={editingForm.amount}
                      onChange={handleEditChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    name="type"
                    value={editingForm.type}
                    onChange={handleEditChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="deposit">Deposit</option>
                    <option value="withdrawal">Withdrawal / Received</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Village Name</label>
                  <input
                    name="villageName"
                    value={editingForm.villageName}
                    onChange={handleEditChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    placeholder="Village name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                  <input
                    name="note"
                    value={editingForm.note}
                    onChange={handleEditChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    placeholder="Remarks"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingTransaction(null)}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading[editingTransaction.id] === 'edit'}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    <Save size={16} />
                    {actionLoading[editingTransaction.id] === 'edit' ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default UserDetail;
