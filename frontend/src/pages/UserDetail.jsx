import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  PiggyBank,
  Scale,
  ArrowDownCircle,
  Pencil,
  Trash2,
  X,
  Save,
  Wallet,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import MetricCard from '../components/MetricCard';
import ConfirmModal from '../components/ConfirmModal';
import api from '../api/axios';
import { formatUtcDateDisplay, toUtcDateKey } from '../utils/dates';

const HistoryActions = ({ transaction, actionLoading, onEdit, onDelete }) => (
  <div className="flex items-center justify-center gap-2">
    <button
      type="button"
      onClick={() => onEdit(transaction)}
      disabled={actionLoading[transaction.id] === 'edit' || actionLoading[transaction.id] === 'delete'}
      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-60"
    >
      <Pencil size={14} /> {actionLoading[transaction.id] === 'edit' ? 'Saving...' : 'Edit'}
    </button>
    <button
      type="button"
      onClick={() => onDelete(transaction)}
      disabled={actionLoading[transaction.id] === 'edit' || actionLoading[transaction.id] === 'delete'}
      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
    >
      <Trash2 size={14} /> {actionLoading[transaction.id] === 'delete' ? 'Deleting...' : 'Delete'}
    </button>
  </div>
);

const TransactionHistoryTables = ({
  deposits,
  withdrawals,
  availablePool,
  totalWithdrawn,
  formatMoney,
  actionLoading,
  onEdit,
  onDelete,
}) => {
  const depositTotals = deposits.reduce(
    (totals, transaction) => {
      const raw = Number(transaction.originalEnteredAmount ?? transaction.amount ?? 0);
      const effective = Number(transaction.calculatedAmount ?? transaction.effectiveDepositBalance ?? raw * 0.5);
      const fee = Number(transaction.extraFee || 0);
      totals.raw += raw;
      totals.effective += effective;
      totals.fee += fee;
      totals.total += effective + fee;
      return totals;
    },
    { raw: 0, effective: 0, fee: 0, total: 0 }
  );
  const withdrawalTotal = totalWithdrawn ?? withdrawals.reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const remainingNetBalance = availablePool - withdrawalTotal;

  const emptyMessage = (label, tint) => (
    <p className={`p-5 text-sm ${tint}`}>No {label} transactions found.</p>
  );

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/80 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-800">Deposit History</h2>
          <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
            {deposits.length} record(s)
          </span>
        </div>
        <div className="overflow-x-auto">
          {deposits.length === 0 ? emptyMessage('deposit', 'text-emerald-700/70') : (
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-emerald-700 text-xs uppercase tracking-wide text-white">
                <tr>
                  <th className="px-3 py-3 text-left">Date</th>
                  <th className="px-3 py-3 text-right">Raw Deposit Amount</th>
                  <th className="px-3 py-3 text-right">50% Effective Balance</th>
                  <th className="px-3 py-3 text-right">Extra Fee</th>
                  <th className="px-3 py-3 text-right">Total for Date</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-3 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50">
                {deposits.map((transaction) => {
                  const raw = Number(transaction.originalEnteredAmount ?? transaction.amount ?? 0);
                  const effective = Number(transaction.calculatedAmount ?? transaction.effectiveDepositBalance ?? raw * 0.5);
                  const fee = Number(transaction.extraFee || 0);
                  return (
                    <tr key={String(transaction.id || transaction._id)} className="table-row-hover hover:bg-emerald-50/60">
                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatUtcDateDisplay(transaction.date)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{formatMoney(raw)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-indigo-700">{formatMoney(effective)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{formatMoney(fee)}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-emerald-600">{formatMoney(effective + fee)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          Deposit
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <HistoryActions transaction={transaction} actionLoading={actionLoading} onEdit={onEdit} onDelete={onDelete} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-emerald-100 bg-emerald-50/70 font-semibold">
                <tr>
                  <td className="px-3 py-3">Deposit Sub-Total</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{formatMoney(depositTotals.raw)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{formatMoney(depositTotals.effective)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{formatMoney(depositTotals.fee)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-emerald-600">{formatMoney(depositTotals.total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-amber-100 bg-amber-50/80 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-800">Withdrawal / Received History</h2>
            <p className="mt-1 text-xs text-amber-800/70">Net Pool Balance = (50% Deposit + Extra Fee) - Total Withdrawals</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-[360px]">
            <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase text-amber-700">Total Withdrawn / Received</p>
              <p className="font-mono text-lg font-bold tabular-nums text-amber-700">{formatMoney(withdrawalTotal)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Remaining Net Balance</p>
              <p className="font-mono text-lg font-bold tabular-nums text-slate-900">{formatMoney(remainingNetBalance)}</p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          {withdrawals.length === 0 ? emptyMessage('withdrawal / received', 'text-amber-800/70') : (
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-amber-600 text-xs uppercase tracking-wide text-white">
                <tr>
                  <th className="px-3 py-3 text-left">Withdrawal Date</th>
                  <th className="px-3 py-3 text-left">Deducted From Deposit Date</th>
                  <th className="px-3 py-3 text-right">Withdrawn / Received Amount</th>
                  <th className="px-3 py-3 text-right">Remaining Deposit Pool</th>
                  <th className="px-3 py-3 text-left">Note / Description</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-3 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {withdrawals.map((transaction) => (
                  <tr key={String(transaction.id || transaction._id)} className="table-row-hover hover:bg-amber-50/60">
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatUtcDateDisplay(transaction.date)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                      {transaction.deductFromDepositDate || transaction.sourceDepositDate
                        ? formatUtcDateDisplay(transaction.deductFromDepositDate || transaction.sourceDepositDate)
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-amber-600">{formatMoney(transaction.amount)}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {transaction.remainingBalanceAfterDeduction == null ? '—' : formatMoney(transaction.remainingBalanceAfterDeduction)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{transaction.note || '—'}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                        Received
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <HistoryActions transaction={transaction} actionLoading={actionLoading} onEdit={onEdit} onDelete={onDelete} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-amber-100 bg-amber-50/70 font-semibold">
                <tr>
                  <td className="px-3 py-3" colSpan={2}>Withdrawal / Received Sub-Total</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-amber-600">{formatMoney(withdrawalTotal)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};

const UserDetail = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editingForm, setEditingForm] = useState({
    date: '',
    type: 'deposit',
    amount: '',
    note: '',
    villageName: '',
    hasExtraFee: false,
    extraFee: 0,
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

  const submitDeleteAll = async () => {
    setActionLoading((prev) => ({ ...prev, allTransactions: 'delete' }));
    try {
      await api.delete(`/transactions/user/${id}/all`);
      setData((prev) =>
        prev
          ? {
              ...prev,
              timeline: [],
              summary: {
                ...prev.summary,
                totalDeposited: 0,
                halfAmount: 0,
                totalDepositBalance: 0,
                totalDepositAmount: 0,
                eligibleHalfAmountTotal: 0,
                totalWithdrawn: 0,
                totalReceivedAmount: 0,
                remainingHalfBalance: 0,
                pendingBalance: 0,
                totalExtraFees: 0,
              },
            }
          : prev
      );
      setDeleteAllOpen(false);
      setSuccess('All transactions deleted successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete all transactions');
      setDeleteAllOpen(false);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next.allTransactions;
        return next;
      });
    }
  };

  const openEditModal = (transaction) => {
    setEditingError('');
    setEditingTransaction(transaction);
    setEditingForm({
      date: transaction.date ? toUtcDateKey(transaction.date) : '',
      type: transaction.type || 'deposit',
      amount: transaction.amount ?? '',
      note: transaction.note || '',
      villageName: transaction.villageName || data?.member?.villageName || '',
      hasExtraFee: Number(transaction.extraFee || 0) > 0,
      extraFee: Number(transaction.extraFee || 0),
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
        extraFee: editingForm.hasExtraFee ? Number(editingForm.extraFee || 0) : 0,
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
        extraFee: 0,
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
    const transactionDate = toUtcDateKey(transaction.date);

    if (appliedDateFrom && transactionDate < appliedDateFrom) {
      return false;
    }

    if (appliedDateTo && transactionDate > appliedDateTo) {
      return false;
    }

    return true;
  });

  const depositTransactions = filteredTimeline.filter((transaction) => String(transaction.type).toLowerCase() === 'deposit');
  const withdrawalTransactions = filteredTimeline.filter((transaction) => String(transaction.type).toLowerCase() !== 'deposit');

  const overallTotals = filteredTimeline.reduce(
    (acc, transaction) => {
      const amount = Number(transaction.amount || 0);
      const extraFee = Number(transaction.extraFee || 0);
      acc.baseTotal += amount;
      acc.extraTotal += extraFee;
      acc.depositTotal += transaction.type === 'deposit'
        ? Number(transaction.originalEnteredAmount ?? amount)
        : 0;
      acc.halfTotal += transaction.type === 'deposit'
        ? Number(transaction.effectiveDepositBalance ?? amount * 0.5)
        : 0;
      acc.grandTotal += Number(transaction.rowTotal ?? (
        transaction.type === 'deposit'
          ? Number(transaction.effectiveDepositBalance ?? amount * 0.5)
          : amount
      ) + extraFee);
      acc.receivedTotal += transaction.type === 'withdrawal' ? amount : 0;
      return acc;
    },
    { baseTotal: 0, depositTotal: 0, extraTotal: 0, grandTotal: 0, halfTotal: 0, receivedTotal: 0 }
  );
  overallTotals.remainingHalfBalance = overallTotals.halfTotal - overallTotals.receivedTotal;
  overallTotals.availablePool = overallTotals.halfTotal + overallTotals.extraTotal;
  overallTotals.remainingNetBalance = overallTotals.availablePool - overallTotals.receivedTotal;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/users" className="worker-nav-link mb-4 flex w-fit items-center gap-1 text-sm text-brand-700">
          <ArrowLeft size={16} /> Back to user directory
        </Link>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : data ? (
          <div className="animate-fade-in">
            <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{data.member.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">{data.member.jNo}</span>
                  <span>{data.member.villageName || '—'}</span>
                  <span>•</span>
                  <span>Admin: {data.member.createdByWorker || '—'}</span>
                  {data.member.phone && (
                    <>
                      <span>•</span>
                      <span className="font-mono tabular-nums">{data.member.phone}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteAllOpen(true)}
                disabled={sortedTimeline.length === 0 || actionLoading.allTransactions === 'delete'}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={14} /> Delete All Transactions
              </button>
            </div>

            <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Filter transactions by date range</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">From Date</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">To Date</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                <div className="flex items-end gap-2 lg:col-span-2">
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
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total Deposit" value={overallTotals.depositTotal} icon={PiggyBank} color="green" />
              <MetricCard label="Half Amount" value={overallTotals.halfTotal} icon={Scale} color="blue" />
              <MetricCard label="Extra Fees" value={overallTotals.extraTotal} icon={ArrowDownCircle} color="green" />
              <MetricCard label="Net Available Balance" value={overallTotals.remainingNetBalance} icon={Wallet} color="amber" />
            </div>

            <TransactionHistoryTables
              deposits={depositTransactions}
              withdrawals={withdrawalTransactions}
              availablePool={overallTotals.availablePool}
              totalWithdrawn={overallTotals.receivedTotal}
              formatMoney={formatMoney}
              actionLoading={actionLoading}
              onEdit={openEditModal}
              onDelete={setTransactionToDelete}
            />
          </div>
        ) : null}

        <ConfirmModal
          open={!!transactionToDelete}
          title="Delete transaction"
          message={`Are you sure you want to delete this transaction for ${data?.member?.name || 'this member'}? This will also update the member balance.`}
          confirmLabel={actionLoading[transactionToDelete?.id] === 'delete' ? 'Deleting...' : 'Delete'}
          onConfirm={submitDelete}
          onCancel={() => setTransactionToDelete(null)}
        />

        <ConfirmModal
          open={deleteAllOpen}
          title="Delete all transactions"
          message="Are you sure you want to delete all transactions for this user? This action cannot be undone."
          confirmLabel={actionLoading.allTransactions === 'delete' ? 'Deleting...' : 'Delete All'}
          onConfirm={submitDeleteAll}
          onCancel={() => setDeleteAllOpen(false)}
        />

        {editingTransaction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Edit Transaction</h3>
                <button
                  type="button"
                  onClick={() => setEditingTransaction(null)}
                  className="text-slate-400 hover:text-slate-600"
                  aria-label="Close edit modal"
                >
                  <X size={18} />
                </button>
              </div>

              {editingError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {editingError}
                </div>
              )}

              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
                    <input
                      type="date"
                      name="date"
                      value={editingForm.date}
                      onChange={handleEditChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Amount (₹)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      name="amount"
                      value={editingForm.amount}
                      onChange={handleEditChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
                  <select
                    name="type"
                    value={editingForm.type}
                    onChange={handleEditChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    <option value="deposit">Deposit</option>
                    <option value="withdrawal">Withdrawal / Received</option>
                  </select>
                </div>

                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Extra Fee</p>
                      <p className="text-xs text-slate-500">Add an optional charge to this transaction</p>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        name="hasExtraFee"
                        checked={!!editingForm.hasExtraFee}
                        onChange={(e) =>
                          setEditingForm((prev) => ({
                            ...prev,
                            hasExtraFee: e.target.checked,
                            extraFee: e.target.checked ? prev.extraFee : 0,
                          }))
                        }
                        className="peer sr-only"
                      />
                      <span className="h-6 w-11 rounded-full bg-slate-200 transition-colors duration-200 peer-checked:bg-brand-600 peer-focus:outline-none" />
                      <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform duration-200 peer-checked:translate-x-5" />
                    </label>
                  </div>

                  {editingForm.hasExtraFee && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="editingExtraFee">
                        Extra Fee Amount (₹)
                      </label>
                      <input
                        id="editingExtraFee"
                        type="number"
                        name="extraFee"
                        min="0"
                        step="0.01"
                        value={editingForm.extraFee}
                        onChange={handleEditChange}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Village Name</label>
                  <input
                    name="villageName"
                    value={editingForm.villageName}
                    onChange={handleEditChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    placeholder="Village name"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Note</label>
                  <input
                    name="note"
                    value={editingForm.note}
                    onChange={handleEditChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    placeholder="Remarks"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingTransaction(null)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading[editingTransaction.id] === 'edit'}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-60"
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
