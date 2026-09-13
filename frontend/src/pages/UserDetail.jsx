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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [appliedDateFrom, setAppliedDateFrom] = useState('');
  const [appliedDateTo, setAppliedDateTo] = useState('');
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
      hasExtraFee: Number(transaction.extraFee || 0) > 0,
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
        extraFee: editingForm.hasExtraFee ? 100 : 0,
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
        hasExtraFee: false,
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

  const formatMoney = (value) =>
    `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const applyDateFilter = () => {
    setAppliedDateFrom(dateFrom);
    setAppliedDateTo(dateTo);
  };

  const clearDateFilter = () => {
    setDateFrom('');
    setDateTo('');
    setAppliedDateFrom('');
    setAppliedDateTo('');
  };

  const sortedTimeline = data?.timeline ? [...data.timeline].sort((a, b) => new Date(b.date) - new Date(a.date)) : [];
  const uniqueTimeline = Array.from(
    new Map((sortedTimeline || []).map((transaction) => [String(transaction._id || transaction.id), transaction])).values()
  );

  const filteredTimeline = uniqueTimeline.filter((transaction) => {
    const transactionDate = new Date(transaction.date).toISOString().slice(0, 10);

    if (appliedDateFrom && transactionDate < appliedDateFrom) {
      return false;
    }

    if (appliedDateTo && transactionDate > appliedDateTo) {
      return false;
    }

    return true;
  });

  const dateGroups = filteredTimeline.reduce((acc, transaction) => {
    const key = new Date(transaction.date).toISOString().slice(0, 10);
    if (!acc[key]) {
      acc[key] = { baseTotal: 0, extraTotal: 0, grandTotal: 0, halfTotal: 0, transactions: [] };
    }
    const baseAmount = Number(transaction.amount || 0);
    const extraFee = Number(transaction.extraFee || 0);
    acc[key].baseTotal += baseAmount;
    acc[key].extraTotal += extraFee;
    acc[key].halfTotal += baseAmount / 2;
    acc[key].grandTotal += baseAmount / 2 + extraFee;
    acc[key].transactions.push(transaction);
    return acc;
  }, {});

  const overallTotals = filteredTimeline.reduce(
    (acc, transaction) => {
      const amount = Number(transaction.amount || 0);
      const extraFee = Number(transaction.extraFee || 0);
      acc.baseTotal += amount;
      acc.extraTotal += extraFee;
      acc.halfTotal += amount / 2;
      acc.grandTotal += amount / 2 + extraFee;
      return acc;
    },
    { baseTotal: 0, extraTotal: 0, grandTotal: 0, halfTotal: 0 }
  );

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

            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-600 uppercase mb-2">Filter transactions by date range</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={applyDateFilter}
                        className="flex-1 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
                      >
                        Filter
                      </button>
                      <button
                        type="button"
                        onClick={clearDateFilter}
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <MetricCard label="Filtered Base" value={overallTotals.baseTotal} icon={PiggyBank} color="green" />
              <MetricCard label="Filtered Half" value={overallTotals.halfTotal} icon={Scale} color="blue" />
              <MetricCard label="Filtered Extra Fee" value={overallTotals.extraTotal} icon={ArrowDownCircle} color="green" />
              <MetricCard label="Filtered Grand Total" value={overallTotals.grandTotal} icon={Scale} color="red" />
            </div>

            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-600 uppercase">Transaction History</h2>
              <span className="inline-flex items-center rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                {appliedDateFrom || appliedDateTo ? `Showing ${filteredTimeline.length} transactions` : `Total Transactions: ${filteredTimeline.length}`}
              </span>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              {filteredTimeline.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">
                  {sortedTimeline.length === 0 ? 'No transactions recorded for this member yet.' : 'No transactions found for the selected date range.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full table-fixed border-collapse text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-blue-700 text-white text-xs uppercase tracking-wide">
                        <th className="px-3 py-3 text-left font-bold min-w-[120px] border border-blue-800">Date</th>
                        <th className="px-3 py-3 text-left font-bold min-w-[120px] border border-blue-800">Type</th>
                        <th className="px-3 py-3 text-right font-bold min-w-[140px] border border-blue-800">Base Amount</th>
                        <th className="px-3 py-3 text-right font-bold min-w-[140px] border border-blue-800">Extra Fee</th>
                        <th className="px-3 py-3 text-right font-bold min-w-[140px] border border-blue-800">Total Amount</th>
                        <th className="px-3 py-3 text-right font-bold min-w-[140px] border border-blue-800">Half Amount</th>
                        <th className="px-3 py-3 text-left font-bold min-w-[180px] border border-blue-800">Note</th>
                        <th className="px-3 py-3 text-center font-bold min-w-[150px] border border-blue-800">Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {Object.entries(dateGroups)
                        .sort((a, b) => new Date(b[0]) - new Date(a[0]))
                        .map(([dateKey, group]) => (
                          <React.Fragment key={dateKey}>
                            <tr className="bg-gray-100">
                              <td className="px-3 py-2 text-left align-middle font-semibold text-gray-700 border border-gray-200" colSpan={2}>
                                {new Date(dateKey).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </td>
                              <td className="px-3 py-2 text-right align-middle font-semibold text-gray-800 border border-gray-200">
                                {formatMoney(group.baseTotal)}
                              </td>
                              <td className="px-3 py-2 text-right align-middle font-semibold text-blue-700 border border-gray-200">
                                {formatMoney(group.extraTotal)}
                              </td>
                              <td className="px-3 py-2 text-right align-middle font-semibold text-green-700 border border-gray-200">
                                {formatMoney(group.grandTotal)}
                              </td>
                              <td className="px-3 py-2 text-right align-middle font-semibold text-indigo-700 border border-gray-200">
                                {formatMoney(group.halfTotal)}
                              </td>
                              <td className="px-3 py-2 text-left align-middle font-medium text-gray-600 border border-gray-200" colSpan={2}>
                                Daily subtotal
                              </td>
                            </tr>

                            {group.transactions.map((t) => (
                              <tr key={t.id} className="bg-white">
                                <td className="px-3 py-2 text-left align-middle text-gray-700 border border-gray-200">
                                  {new Date(t.date).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </td>
                                <td className="px-3 py-2 text-left align-middle border border-gray-200">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                      t.type === 'deposit'
                                        ? 'bg-green-50 text-green-700'
                                        : 'bg-amber-50 text-amber-700'
                                    }`}
                                  >
                                    {t.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right align-middle font-semibold text-gray-800 border border-gray-200 whitespace-nowrap">
                                  {formatMoney(t.amount)}
                                </td>
                                <td className="px-3 py-2 text-right align-middle text-blue-700 font-semibold border border-gray-200 whitespace-nowrap">
                                  {formatMoney(Number(t.extraFee || 0))}
                                </td>
                                <td className="px-3 py-2 text-right align-middle font-semibold text-green-700 border border-gray-200 whitespace-nowrap">
                                  {formatMoney(Number(t.amount || 0) / 2 + Number(t.extraFee || 0))}
                                </td>
                                <td className="px-3 py-2 text-right align-middle text-indigo-700 font-semibold border border-gray-200 whitespace-nowrap">
                                  {formatMoney(Number(t.amount || 0) / 2)}
                                </td>
                                <td className="px-3 py-2 text-left align-middle text-gray-600 border border-gray-200">
                                  {t.note || '—'}
                                </td>
                                <td className="px-3 py-2 text-center align-middle border border-gray-200">
                                  <div className="flex items-center justify-center gap-2">
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
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                    </tbody>

                    <tfoot>
                      <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                        <td className="px-3 py-3 text-left align-middle font-bold border border-gray-300" colSpan={2}>
                          Overall Total
                        </td>
                        <td className="px-3 py-3 text-right align-middle border border-gray-300 whitespace-nowrap text-gray-800">
                          {formatMoney(overallTotals.baseTotal)}
                        </td>
                        <td className="px-3 py-3 text-right align-middle border border-gray-300 whitespace-nowrap text-blue-700">
                          {formatMoney(overallTotals.extraTotal)}
                        </td>
                        <td className="px-3 py-3 text-right align-middle border border-gray-300 whitespace-nowrap text-green-700">
                          {formatMoney(overallTotals.grandTotal)}
                        </td>
                        <td className="px-3 py-3 text-right align-middle border border-gray-300 whitespace-nowrap text-indigo-700">
                          {formatMoney(overallTotals.halfTotal)}
                        </td>
                        <td className="px-3 py-3 text-left align-middle border border-gray-300" colSpan={2}>
                          Half + Extra = {formatMoney(overallTotals.grandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
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

                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Add +₹100 Extra Fee?</p>
                    <p className="text-xs text-gray-500">Optional charge for this entry</p>
                  </div>

                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      name="hasExtraFee"
                      checked={!!editingForm.hasExtraFee}
                      onChange={(e) => setEditingForm((prev) => ({ ...prev, hasExtraFee: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <span className="h-6 w-11 rounded-full bg-gray-200 peer-checked:bg-brand-600 transition-colors duration-200 peer-focus:outline-none" />
                    <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform duration-200 peer-checked:translate-x-5" />
                  </label>
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
