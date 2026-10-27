import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  X,
  PlusCircle,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Layers,
  Pencil,
  Trash2,
  Inbox,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import TransactionForm from '../components/TransactionForm';
import ConfirmModal from '../components/ConfirmModal';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { isFutureDateKey, isValidDateKey, todayKey, toUtcDateKey, formatUtcDateDisplay } from '../utils/dates';

/* ───────────────────────── formatting + style tokens ──────────────────────── */

const formatMoney = (v) =>
  `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatMoneyShort = (v) => `₹${Math.round(Number(v || 0)).toLocaleString('en-IN')}`;

// Type pills: warm money palette (deposit / withdrawal).
const TYPE_STYLES = {
  deposit: {
    label: 'Deposit',
    className:
      'bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 shadow-[0_0_12px_-4px_rgba(16,185,129,0.7)] dark:text-emerald-400',
  },
  withdrawal: {
    label: 'Withdrawal',
    className:
      'bg-amber-500/10 text-amber-700 ring-amber-500/30 shadow-[0_0_12px_-4px_rgba(245,158,11,0.7)] dark:text-amber-400',
  },
};

// Status pills: cool palette so they never read as a second type column.
// Deposits carry a maintained `remainingBalance` cache (the API replays the
// ledger and writes it back on every withdrawal); legacy rows without the
// cache fall back to amount * 0.5, which is correct for untouched deposits.
const STATUS_STYLES = {
  active: {
    label: 'Active',
    className:
      'bg-sky-500/10 text-sky-700 ring-sky-500/30 shadow-[0_0_12px_-4px_rgba(14,165,233,0.7)] dark:text-sky-400',
  },
  settled: {
    label: 'Settled',
    className:
      'bg-violet-500/10 text-violet-700 ring-violet-500/30 shadow-[0_0_12px_-4px_rgba(139,92,246,0.7)] dark:text-violet-400',
  },
  paid: {
    label: 'Paid',
    className:
      'bg-indigo-500/10 text-indigo-700 ring-indigo-500/30 shadow-[0_0_12px_-4px_rgba(99,102,241,0.7)] dark:text-indigo-400',
  },
};

const getStatus = (t) => {
  if (t.type === 'withdrawal') return STATUS_STYLES.paid;
  const remaining =
    t.remainingBalance === null || t.remainingBalance === undefined
      ? Number(t.amount || 0) * 0.5
      : Number(t.remainingBalance);
  return remaining > 0.009 ? STATUS_STYLES.active : STATUS_STYLES.settled;
};

// Soft-glow pill: tinted translucent fill + inset ring + a colored drop glow.
const Pill = ({ className, children }) => (
  <span
    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ring-1 ring-inset ${className}`}
  >
    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
    {children}
  </span>
);

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:focus-visible:ring-brand-400';

const controlClass =
  'w-full min-w-0 rounded-xl border border-line-strong/70 bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

const labelClass = 'mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-muted';

// Highlight stat card (Income / Expense / Count).
const StatCard = ({ label, value, caption, icon: Icon, tone }) => (
  <div className="relative overflow-hidden rounded-2xl border border-line bg-surface/80 p-5 shadow-sm backdrop-blur-sm">
    <span
      aria-hidden="true"
      className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent"
    />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
        <p className="mt-2 truncate text-2xl font-bold tabular-nums tracking-tight text-ink">{value}</p>
        <p className="mt-1 truncate text-xs text-ink-muted">{caption}</p>
      </div>
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ${tone}`}
      >
        <Icon size={20} aria-hidden="true" />
      </span>
    </div>
  </div>
);

/* ─────────────────────────────── page ────────────────────────────────────── */

const RecordTransaction = () => {
  const { showToast } = useToast();

  // Data
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [error, setError] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [memberFilter, setMemberFilter] = useState('');

  // Add / edit / delete
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ amount: '', date: '', note: '', villageName: '', extraFee: '' });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const fetchMembers = async () => {
    setMembersLoading(true);
    try {
      const res = await api.get('/members');
      setMembers(res.data.members || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setListLoading(true);
    try {
      const res = await api.get('/transactions');
      setTransactions(res.data.transactions || []);
      setListError('');
    } catch (err) {
      setListError(err.response?.data?.message || 'Failed to load transactions');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes whichever overlay is open.
  useEffect(() => {
    if (!addOpen && !editing) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setAddOpen(false);
        setEditing(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [addOpen, editing]);

  const handleCreate = async (data) => {
    await api.post('/transactions', data);
    await fetchTransactions();
  };

  /* ── derived data ── */

  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    let fees = 0;
    let deposits = 0;
    let withdrawals = 0;
    for (const t of transactions) {
      if (t.type === 'deposit') {
        deposits += 1;
        income += Number(t.amount || 0) + Number(t.extraFee || 0);
        fees += Number(t.extraFee || 0);
      } else {
        withdrawals += 1;
        expense += Number(t.amount || 0);
      }
    }
    return { income, expense, fees, deposits, withdrawals, count: transactions.length };
  }, [transactions]);

  const hasActiveFilters = Boolean(search.trim() || dateFrom || dateTo || memberFilter);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (memberFilter && String(t.member?._id || t.member || '') !== memberFilter) return false;
      if (dateFrom || dateTo) {
        const key = toUtcDateKey(t.date);
        if (!key) return false;
        if (dateFrom && key < dateFrom) return false;
        if (dateTo && key > dateTo) return false;
      }
      if (term) {
        const haystack = [
          t.member?.name,
          t.member?.workerName,
          t.member?.jNo,
          t.villageName,
          t.member?.villageName,
          t.note,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [transactions, search, dateFrom, dateTo, memberFilter]);

  const clearFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setMemberFilter('');
  };

  /* ── edit flow ── */

  const openEdit = (t) => {
    setEditing(t);
    setEditError('');
    setEditForm({
      amount: String(t.amount ?? ''),
      date: toUtcDateKey(t.date) || todayKey(),
      note: t.note || '',
      villageName: t.villageName || t.member?.villageName || '',
      extraFee: t.type === 'deposit' ? String(t.extraFee ?? 0) : '',
    });
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    setEditError('');
    const amount = Number(editForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setEditError('Amount must be greater than 0.');
      return;
    }
    if (!isValidDateKey(editForm.date)) {
      setEditError('Please select a valid transaction date.');
      return;
    }
    if (isFutureDateKey(editForm.date)) {
      setEditError('Transaction date cannot be in the future.');
      return;
    }
    if (editing.type === 'deposit') {
      const fee = Number(editForm.extraFee || 0);
      if (!Number.isFinite(fee) || fee < 0) {
        setEditError('Extra fee must be zero or a positive number.');
        return;
      }
    }

    setEditSaving(true);
    try {
      const payload = {
        amount,
        date: editForm.date,
        note: editForm.note,
        villageName: editForm.villageName,
      };
      if (editing.type === 'deposit') payload.extraFee = Number(editForm.extraFee || 0);
      await api.put(`/transactions/${editing._id}`, payload);
      showToast('Transaction updated successfully.', 'success', 'Transaction Updated');
      setEditing(null);
      await fetchTransactions();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to update transaction';
      setEditError(message);
      showToast(message, 'error', 'Update Failed');
    } finally {
      setEditSaving(false);
    }
  };

  /* ── delete flow ── */

  const submitDelete = async () => {
    if (!deleting) return;
    setDeleteSaving(true);
    try {
      await api.delete(`/transactions/${deleting._id}`);
      showToast('Transaction deleted from the ledger.', 'success', 'Transaction Deleted');
      setDeleting(null);
      await fetchTransactions();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete transaction', 'error', 'Delete Failed');
    } finally {
      setDeleteSaving(false);
    }
  };

  /* ── render ── */

  return (
    <div className="relative min-h-screen bg-canvas">
      {/* Ambient header glows — clipped inside their own box so they can never
          create horizontal scroll or interfere with the sticky navbar. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden">
        <div className="absolute -left-20 -top-24 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl dark:bg-brand-500/20" />
        <div className="absolute -right-16 -top-32 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl dark:bg-emerald-500/10" />
      </div>

      <Navbar />

      <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            Financial Ledger
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Transactions</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            Every deposit and withdrawal in one place — search, filter, edit and manage the full ledger.
          </p>
        </header>

        {error && (
          <div className="mt-5 max-w-xl rounded-xl border border-rose-300/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/60 dark:text-rose-300">
            {error}
          </div>
        )}

        {membersLoading ? (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl border border-line bg-surface/60" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center shadow-sm">
            <p className="text-sm text-ink-soft">
              No members found. Please add a member first from{' '}
              <Link to="/members" className="font-medium text-brand-700 no-underline hover:no-underline dark:text-brand-400">
                Manage Members
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            {/* ── Highlight cards ───────────────────────────────────────── */}
            <section aria-label="Ledger totals" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Income"
                value={formatMoneyShort(stats.income)}
                caption={stats.fees > 0 ? `Incl. ${formatMoneyShort(stats.fees)} extra fees` : `${stats.deposits} deposits`}
                icon={TrendingUp}
                tone="from-emerald-500 to-teal-600 shadow-emerald-500/25"
              />
              <StatCard
                label="Expense"
                value={formatMoneyShort(stats.expense)}
                caption={`${stats.withdrawals} withdrawals`}
                icon={TrendingDown}
                tone="from-rose-500 to-orange-500 shadow-rose-500/25"
              />
              <StatCard
                label="Total Ledger Count"
                value={stats.count.toLocaleString('en-IN')}
                caption="entries recorded"
                icon={Layers}
                tone="from-brand-500 to-indigo-600 shadow-brand-500/25"
              />
            </section>

            {/* ── Filter & action bar ───────────────────────────────────── */}
            <section
              aria-label="Filters and actions"
              className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface/70 p-3 shadow-sm backdrop-blur-md"
            >
              <div className="relative w-full lg:flex-1 lg:min-w-[14rem]">
                <label htmlFor="tx-search" className="sr-only">
                  Search transactions
                </label>
                <Search
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                />
                <input
                  id="tx-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search member, J.No, village or note…"
                  className={`${controlClass} py-2.5 pl-9 pr-9`}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-ink-faint transition-colors hover:text-ink ${focusRing}`}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="flex w-full items-end gap-2 sm:w-auto">
                <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                  <label htmlFor="tx-from" className={labelClass}>
                    From
                  </label>
                  <input
                    id="tx-from"
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className={`${controlClass} py-2`}
                  />
                </div>
                <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                  <label htmlFor="tx-to" className={labelClass}>
                    To
                  </label>
                  <input
                    id="tx-to"
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    max={todayKey()}
                    onChange={(e) => setDateTo(e.target.value)}
                    className={`${controlClass} py-2`}
                  />
                </div>
              </div>

              <div className="w-full sm:w-48 sm:flex-none">
                <label htmlFor="tx-member" className={labelClass}>
                  Member
                </label>
                <div className="relative">
                  <select
                    id="tx-member"
                    value={memberFilter}
                    onChange={(e) => setMemberFilter(e.target.value)}
                    className={`${controlClass} appearance-none py-2 pr-9`}
                  >
                    <option value="">All members</option>
                    {members.map((m) => (
                      <option key={m._id || m.id} value={m._id || m.id}>
                        {m.jNo ? `${m.jNo} — ` : ''}
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={15}
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
                  />
                </div>
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className={`inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-subtle hover:text-ink ${focusRing}`}
                >
                  <X size={14} aria-hidden="true" /> Clear
                </button>
              )}

              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className={`ml-auto inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:from-brand-500 hover:to-brand-400 hover:shadow-brand-500/30 ${focusRing}`}
              >
                <PlusCircle size={17} aria-hidden="true" /> Add Transaction
              </button>
            </section>

            {/* ── Transactions table ────────────────────────────────────── */}
            <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface/80 shadow-sm backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Ledger entries</h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Showing {filtered.length} of {transactions.length} entries
                    {hasActiveFilters ? ' · filtered' : ''}
                  </p>
                </div>
                <span className="hidden rounded-full bg-subtle px-2.5 py-1 text-[11px] font-medium text-ink-muted sm:inline">
                  Newest first
                </span>
              </div>

              {listLoading ? (
                <div aria-hidden="true">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 border-b border-line/50 px-5 py-4">
                      <div className="h-3 w-20 animate-pulse rounded-lg bg-subtle" />
                      <div className="h-3 w-32 animate-pulse rounded-lg bg-subtle" />
                      <div className="h-5 w-20 animate-pulse rounded-full bg-subtle" />
                      <div className="ml-auto h-3 w-24 animate-pulse rounded-lg bg-subtle" />
                    </div>
                  ))}
                </div>
              ) : listError ? (
                <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                  <p className="text-sm text-rose-600 dark:text-rose-400">{listError}</p>
                  <button
                    type="button"
                    onClick={fetchTransactions}
                    className={`rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-subtle ${focusRing}`}
                  >
                    Retry
                  </button>
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <span className="rounded-2xl bg-subtle p-4 text-ink-muted">
                    <Inbox size={28} aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-ink">No transactions yet</h3>
                  <p className="mt-1 text-sm text-ink-muted">Record your first deposit to start the ledger.</p>
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className={`mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:from-brand-500 hover:to-brand-400 ${focusRing}`}
                  >
                    <PlusCircle size={17} aria-hidden="true" /> Add Transaction
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <span className="rounded-2xl bg-subtle p-4 text-ink-muted">
                    <Search size={28} aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-ink">No matching transactions</h3>
                  <p className="mt-1 text-sm text-ink-muted">Try adjusting your search, dates or member filter.</p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`mt-4 rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-subtle ${focusRing}`}
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-auto">
                  <table className="min-w-[46rem] w-full border-separate border-spacing-0 text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">
                        <th className="border-b border-line bg-surface/95 px-5 py-3 text-left font-semibold backdrop-blur">
                          Date
                        </th>
                        <th className="border-b border-line bg-surface/95 px-5 py-3 text-left font-semibold backdrop-blur">
                          Member
                        </th>
                        <th className="border-b border-line bg-surface/95 px-5 py-3 text-left font-semibold backdrop-blur">
                          Type
                        </th>
                        <th className="border-b border-line bg-surface/95 px-5 py-3 text-left font-semibold backdrop-blur">
                          Status
                        </th>
                        <th className="hidden border-b border-line bg-surface/95 px-5 py-3 text-left font-semibold backdrop-blur xl:table-cell">
                          Note
                        </th>
                        <th className="border-b border-line bg-surface/95 px-5 py-3 text-right font-semibold backdrop-blur">
                          Amount
                        </th>
                        <th className="w-24 border-b border-line bg-surface/95 px-5 py-3 text-right font-semibold backdrop-blur">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((t) => {
                        const typeStyle = TYPE_STYLES[t.type] || TYPE_STYLES.deposit;
                        const statusStyle = getStatus(t);
                        const memberName = t.member?.name || t.member?.workerName || 'Unknown member';
                        const memberSub = [
                          t.member?.jNo,
                          t.villageName || t.member?.villageName,
                        ]
                          .filter(Boolean)
                          .join(' · ');
                        const isDeposit = t.type === 'deposit';

                        return (
                          <tr
                            key={t._id}
                            className="group border-b border-line/50 transition-colors odd:bg-slate-50/60 even:bg-transparent hover:bg-slate-100/70 dark:odd:bg-slate-800/30 dark:even:bg-transparent dark:hover:bg-slate-800/50"
                          >
                            <td className="whitespace-nowrap border-b border-line/40 px-5 py-3.5 align-middle text-ink-soft">
                              {formatUtcDateDisplay(t.date)}
                            </td>
                            <td className="border-b border-line/40 px-5 py-3.5 align-middle">
                              {t.member?._id ? (
                                <Link
                                  to={`/users/${t.member._id}`}
                                  className={`rounded font-semibold text-brand-700 transition-colors hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 ${focusRing}`}
                                >
                                  {memberName}
                                </Link>
                              ) : (
                                <span className="font-semibold text-ink">{memberName}</span>
                              )}
                              {memberSub && <p className="mt-0.5 text-[11px] text-ink-muted">{memberSub}</p>}
                            </td>
                            <td className="border-b border-line/40 px-5 py-3.5 align-middle">
                              <Pill className={typeStyle.className}>{typeStyle.label}</Pill>
                            </td>
                            <td className="border-b border-line/40 px-5 py-3.5 align-middle">
                              <Pill className={statusStyle.className}>{statusStyle.label}</Pill>
                            </td>
                            <td className="hidden max-w-[16rem] border-b border-line/40 px-5 py-3.5 align-middle xl:table-cell">
                              <p className="truncate text-ink-muted">{t.note || <span className="text-ink-faint">—</span>}</p>
                            </td>
                            <td className="whitespace-nowrap border-b border-line/40 px-5 py-3.5 text-right align-middle font-semibold tabular-nums">
                              <span className={isDeposit ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                                {isDeposit ? '+' : '−'}
                                {formatMoney(t.amount)}
                              </span>
                              {isDeposit && Number(t.extraFee) > 0 && (
                                <p className="mt-0.5 text-[11px] font-normal text-ink-muted">
                                  +{formatMoneyShort(t.extraFee)} fee
                                </p>
                              )}
                            </td>
                            <td className="border-b border-line/40 px-5 py-3.5 text-right align-middle">
                              {/* Discreet on pointer devices (reveal on row hover
                                  or keyboard focus), always visible on touch. */}
                              <div className="flex items-center justify-end gap-1 transition-opacity duration-150 motion-reduce:transition-none md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => openEdit(t)}
                                  aria-label={`Edit transaction for ${memberName}`}
                                  title="Edit"
                                  className={`rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-brand-500/10 hover:text-brand-600 dark:hover:text-brand-400 ${focusRing}`}
                                >
                                  <Pencil size={15} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleting(t)}
                                  aria-label={`Delete transaction for ${memberName}`}
                                  title="Delete"
                                  className={`rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 ${focusRing}`}
                                >
                                  <Trash2 size={15} aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* ── Add transaction overlay (wraps the existing themed form) ──── */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Record a transaction"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAddOpen(false);
          }}
        >
          <div className="mx-auto my-4 w-full max-w-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold tracking-tight text-white sm:text-lg">
                Record a transaction
              </h2>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                aria-label="Close"
                className={`rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 ${focusRing}`}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <TransactionForm members={members} onSubmit={handleCreate} />
          </div>
        </div>
      )}

      {/* ── Edit transaction overlay ───────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-tx-title">
          <form
            onSubmit={submitEdit}
            className="mx-auto my-6 w-full max-w-lg rounded-2xl border border-line bg-surface p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="edit-tx-title" className="text-base font-bold tracking-tight text-ink">
                  Edit transaction
                </h2>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {editing.member?.name || editing.member?.workerName || 'Member'} ·{' '}
                  {(TYPE_STYLES[editing.type] || TYPE_STYLES.deposit).label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="Close"
                className={`rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink ${focusRing}`}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {editError && (
              <div className="mt-4 rounded-xl border border-rose-300/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/60 dark:text-rose-300">
                {editError}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-amount" className={labelClass}>
                  Amount (₹)
                </label>
                <input
                  id="edit-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editForm.amount}
                  onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                  className={`${controlClass} tabular-nums`}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label htmlFor="edit-date" className={labelClass}>
                  Date
                </label>
                <input
                  id="edit-date"
                  type="date"
                  max={todayKey()}
                  value={editForm.date}
                  onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                  className={controlClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="edit-village" className={labelClass}>
                  Village
                </label>
                <input
                  id="edit-village"
                  type="text"
                  value={editForm.villageName}
                  onChange={(e) => setEditForm((f) => ({ ...f, villageName: e.target.value }))}
                  className={controlClass}
                  placeholder="Village name"
                />
              </div>
              {editing.type === 'deposit' && (
                <div>
                  <label htmlFor="edit-fee" className={labelClass}>
                    Extra fee (₹)
                  </label>
                  <input
                    id="edit-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.extraFee}
                    onChange={(e) => setEditForm((f) => ({ ...f, extraFee: e.target.value }))}
                    className={`${controlClass} tabular-nums`}
                    placeholder="0.00"
                  />
                </div>
              )}
              <div className={editing.type === 'deposit' ? 'sm:col-span-2' : ''}>
                <label htmlFor="edit-note" className={labelClass}>
                  Note
                </label>
                <input
                  id="edit-note"
                  type="text"
                  value={editForm.note}
                  onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                  className={controlClass}
                  placeholder="Remarks (optional)"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className={`rounded-xl border border-line-strong px-4 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink ${focusRing}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className={`rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:from-brand-500 hover:to-brand-400 disabled:opacity-60 ${focusRing}`}
              >
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Delete confirmation ────────────────────────────────────────── */}
      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete transaction?"
        message={`This will permanently remove the ${deleting?.type === 'withdrawal' ? 'withdrawal' : 'deposit'} of ${formatMoney(
          deleting?.amount
        )} from the ledger. This action cannot be undone.`}
        confirmLabel={deleteSaving ? 'Deleting…' : 'Delete'}
        onConfirm={submitDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
};

export default RecordTransaction;
