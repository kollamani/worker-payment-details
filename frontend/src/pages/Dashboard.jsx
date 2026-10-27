import React, { useCallback, useDeferredValue, useEffect, useRef, useState, useTransition } from 'react';
import { RefreshCw, PiggyBank, ArrowDownCircle, Scale, Users, CalendarDays, SlidersHorizontal, Search, AlertTriangle, ChevronDown, FileSpreadsheet, Loader2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import LedgerTable from '../components/LedgerTable';
import MetricCard from '../components/MetricCard';
import ConfirmModal from '../components/ConfirmModal';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { buildWorkerPivotFromGrid, exportWorkerPivotXlsx } from '../utils/workerPivotExport';
import { useDashboardFilters } from '../hooks/useDashboardFilters';

const toDateKey = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  // Transaction dates are stored as UTC midnight of the intended calendar day,
  // so day keys must be derived with UTC getters — local getters would shift
  // the day for users in negative UTC offsets.
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const Dashboard = () => {
  const [grid, setGrid] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  // True while a grid revalidation is in progress after data already exists —
  // the previous table stays mounted and only a subtle overlay is shown.
  const [gridUpdating, setGridUpdating] = useState(false);

  // Racing-fetch guards: every request carries a monotonically increasing id,
  // superseded requests are aborted (AbortController) *and* ignored on
  // completion, so a slow stale response can never overwrite fresh filtered
  // data. gridLoadedRef flips once the first payload lands; later refreshes
  // keep the table mounted instead of flipping back to the splash (the blink).
  const fetchSeqRef = useRef(0);
  const txSeqRef = useRef(0);
  const membersSeqRef = useRef(0);
  const gridAbortRef = useRef(null);
  const txAbortRef = useRef(null);
  const membersAbortRef = useRef(null);
  const gridLoadedRef = useRef(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Dashboard filters persist across tab switches and route navigation. The
  // hook seeds from the URL query params (deep link / back-forward) falling
  // back to its sessionStorage cache, and re-writes both on every change.
  // Alias the hook fields to the page's historical names so the fetch effect,
  // derived data, and danger-zone flows below stay untouched.
  const { filters, setFilter, resetFilters } = useDashboardFilters();

  // Filter handlers are wrapped in startTransition: the filter state commits
  // immediately (URL + storage stay exact) but the heavy re-filter of the
  // whole table renders in a non-blocking concurrent pass, `isFiltering`
  // spans that pass → used for the subtle "updating" overlay.
  const [isFiltering, startFilterTransition] = useTransition();
  const setSearchTerm = (value) => startFilterTransition(() => setFilter('search', value || ''));
  const setSelectedVillage = (value) => startFilterTransition(() => setFilter('village', value || ''));
  const setSelectedWorker = (value) => startFilterTransition(() => setFilter('worker', value || ''));
  const setTransactionStatus = (value) => startFilterTransition(() => setFilter('status', value || 'all'));
  const setDateFrom = (value) => startFilterTransition(() => setFilter('dateFrom', value || ''));
  const setDateTo = (value) => startFilterTransition(() => setFilter('dateTo', value || ''));

  // Urgent values feed the controls (handlers, active-filter flags); the
  // table derivations below read the deferred copy so typing stays crisp and
  // the previous table is kept visible while the next one is derived.
  const searchTerm = filters.search;
  const selectedVillage = filters.village;
  const selectedWorker = filters.worker;
  const transactionStatus = filters.status;
  const dateFrom = filters.dateFrom;
  const dateTo = filters.dateTo;
  const deferredFilters = useDeferredValue(filters);
  const dSearchTerm = deferredFilters.search;
  const dSelectedVillage = deferredFilters.village;
  const dSelectedWorker = deferredFilters.worker;
  const dTransactionStatus = deferredFilters.status;
  const dDateFrom = deferredFilters.dateFrom;
  const dDateTo = deferredFilters.dateTo;

  const [workers, setWorkers] = useState([]);
  const [deleteRangeOpen, setDeleteRangeOpen] = useState(false);
  const [deleteRange, setDeleteRange] = useState({ startDate: '', endDate: '' });
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  // True while the worker pivot .xlsx is being generated (the writer is
  // synchronous, so the button shows a spinner for that window).
  const [exportingWorkerSheet, setExportingWorkerSheet] = useState(false);
  // Snapshot of the filters the pending Danger-Zone delete will target, so the
  // confirmation prompt and the API request always match exactly what the user
  // confirmed.
  const [pendingDeleteFilters, setPendingDeleteFilters] = useState(null);
  const { showToast } = useToast();

  const fetchGrid = useCallback(async (village = selectedVillage, worker = selectedWorker) => {
    const requestId = ++fetchSeqRef.current;
    gridAbortRef.current?.abort();
    const controller = new AbortController();
    gridAbortRef.current = controller;

    // Only the very first load gets the full splash; refreshes keep the
    // previous table visible and just signal "updating".
    if (!gridLoadedRef.current) setLoading(true);
    setGridUpdating(true);

    try {
      const res = await api.get('/transactions/ledger/grid', {
        params: {
          ...(village ? { village } : {}),
          ...(worker ? { worker } : {}),
        },
        signal: controller.signal,
      });
      // A newer request has superseded this one — drop the result entirely so
      // the UI never renders a stale (unfiltered) response.
      if (requestId !== fetchSeqRef.current) return;
      setGrid(res.data);
      gridLoadedRef.current = true;
      if (res.data.workers) setWorkers(res.data.workers);
      setError('');
    } catch (err) {
      const canceled = err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError';
      if (canceled || requestId !== fetchSeqRef.current) return;
      setError(err.response?.data?.message || 'Failed to load ledger sheet');
    } finally {
      // Only the latest request may close out the loading states; otherwise an
      // older, slower response would clear the spinner while its replacement
      // is still in flight (double-blink + stale data window).
      if (requestId === fetchSeqRef.current) {
        setGridUpdating(false);
        setLoading(false);
      }
    }
  }, [selectedVillage, selectedWorker]);

  const fetchTransactions = useCallback(async () => {
    const requestId = ++txSeqRef.current;
    txAbortRef.current?.abort();
    const controller = new AbortController();
    txAbortRef.current = controller;
    try {
      const res = await api.get('/transactions', { signal: controller.signal });
      if (requestId !== txSeqRef.current) return;
      setTransactions(res.data.transactions || []);
    } catch (err) {
      // Cancellation or a superseded request: silently keep whatever the
      // previous list was — blanking the table out on a transient failure
      // was part of the flash-to-empty symptom.
      const canceled = err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError';
      if (canceled || requestId !== txSeqRef.current) return;
    }
  }, []);

  const fetchMembers = useCallback(async () => {
    const requestId = ++membersSeqRef.current;
    membersAbortRef.current?.abort();
    const controller = new AbortController();
    membersAbortRef.current = controller;
    try {
      const res = await api.get('/members', { signal: controller.signal });
      if (requestId !== membersSeqRef.current) return;
      setMembers(res.data.members || []);
    } catch (err) {
      const canceled = err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError';
      if (canceled || requestId !== membersSeqRef.current) return;
    }
  }, []);

  // Resolves the Danger-Zone delete criteria: the dropdown's own date inputs
  // win, otherwise fall back to the active From/To date filters. The worker
  // and village filters currently applied to the ledger are always included so
  // the delete targets exactly the transactions visible on screen.
  const resolveDeleteFilters = () => {
    const startDate = deleteRange.startDate || dateFrom;
    const endDate = deleteRange.endDate || dateTo;
    if (!startDate || !endDate) return null;
    if (startDate > endDate) return null;
    return {
      startDate,
      endDate,
      ...(selectedWorker ? { worker: selectedWorker } : {}),
      ...(selectedVillage ? { village: selectedVillage } : {}),
    };
  };

  const requestDeleteRange = () => {
    const startDate = deleteRange.startDate || dateFrom;
    const endDate = deleteRange.endDate || dateTo;
    if (!startDate || !endDate) {
      const message = 'Please select both a start date and an end date (or set the From/To date filters).';
      setError(message);
      showToast(message, 'error', 'Danger Zone');
      return;
    }
    if (startDate > endDate) {
      const message = 'Start date cannot be after end date.';
      setError(message);
      showToast(message, 'error', 'Danger Zone');
      return;
    }
    setDeleteRange({ startDate, endDate });
    setPendingDeleteFilters(resolveDeleteFilters());
    setError('');
    // Prominent confirmation prompt before dispatching the delete request.
    setDeleteRangeOpen(true);
  };

  const confirmDeleteRange = async () => {
    const filters = pendingDeleteFilters || {
      ...deleteRange,
      ...(selectedWorker ? { worker: selectedWorker } : {}),
      ...(selectedVillage ? { village: selectedVillage } : {}),
    };
    try {
      const res = await api.delete('/transactions/filtered-delete', { params: filters });
      const deletedCount = Number(res.data?.count ?? res.data?.deletedCount ?? 0);
      setDeleteRangeOpen(false);
      setPendingDeleteFilters(null);
      const summary = `Successfully deleted ${deletedCount} transaction${deletedCount === 1 ? '' : 's'} (${filters.startDate} → ${filters.endDate}).`;
      setSuccessMessage(summary);
      showToast(summary, 'success', 'Danger Zone');
      await Promise.all([fetchGrid(selectedVillage, selectedWorker), fetchTransactions()]);
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to delete transactions for the selected range';
      setError(message);
      showToast(`Failed to delete transactions: ${message}`, 'error', 'Danger Zone');
      setDeleteRangeOpen(false);
    }
  };

  // Village/worker are the only server-side grid filters; every other filter
  // (search, status, date range) applies purely client-side and must NOT
  // re-trigger these heavier refetches.
  useEffect(() => {
    fetchGrid(selectedVillage, selectedWorker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVillage, selectedWorker]);

  // Reference data (members + all transactions) is filter-independent — all
  // filtering derives from these lists client-side. Load once; refetching on
  // every dropdown change was redundant churn that amplified the blink.
  useEffect(() => {
    fetchTransactions();
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving the dashboard aborts any in-flight requests so responses can't
  // settle after unmount.
  useEffect(() => () => {
    gridAbortRef.current?.abort();
    txAbortRef.current?.abort();
    membersAbortRef.current?.abort();
  }, []);

  const memberMatchesFilters = (member) => {
    const villageName = (member.villageName || '').trim().toLowerCase();
    const workerName = (member.createdByWorker || '').trim().toLowerCase();
    const matchesVillage = !dSelectedVillage || villageName === dSelectedVillage.trim().toLowerCase();
    const matchesWorker = !dSelectedWorker || workerName === dSelectedWorker.trim().toLowerCase();
    return matchesVillage && matchesWorker;
  };

  const allMemberIds = (members || []).filter(memberMatchesFilters).map((member) => String(member._id));
  const allMemberSet = new Set(allMemberIds);
  const availableDateKeys = (grid?.dates || []).slice().sort();

  const rangeTransactions = transactions.filter((transaction) => {
    const memberId = String(transaction.member?._id || transaction.member || '');
    if (!allMemberSet.has(memberId)) return false;

    const dateKey = toDateKey(transaction.date);
    if (!dateKey) return false;
    if (dDateFrom && dateKey < dDateFrom) return false;
    if (dDateTo && dateKey > dDateTo) return false;
    return true;
  });

  const doneMemberIds = new Set(
    rangeTransactions.map((transaction) => String(transaction.member?._id || transaction.member || ''))
  );
  const pendingMemberIds = new Set(allMemberIds.filter((memberId) => !doneMemberIds.has(memberId)));
  const hasActiveFilters = Boolean(dateFrom || dateTo || selectedVillage || selectedWorker || transactionStatus !== 'all');

  const statusMemberIds =
    dTransactionStatus === 'done'
      ? doneMemberIds
      : dTransactionStatus === 'pending'
        ? pendingMemberIds
        : allMemberSet;

  const activeUserCount = statusMemberIds.size;

  const summaryTotals = rangeTransactions.reduce(
    (acc, transaction) => {
      const amount = Number(transaction.amount || 0);
      const extra = Number(transaction.extraFee || 0);
      if (transaction.type === 'deposit') acc.totalDeposited += amount;
      else if (transaction.type === 'withdrawal') acc.totalWithdrawn += amount;
      acc.totalExtraFees += extra;
      return acc;
    },
    { totalDeposited: 0, totalWithdrawn: 0, totalExtraFees: 0 }
  );
  summaryTotals.halfAmount = rangeTransactions.reduce(
    (total, transaction) =>
      total + (transaction.type === 'deposit'
        ? Number(transaction.effectiveDepositBalance ?? Number(transaction.amount || 0) * 0.5)
        : 0),
    0
  );
  // Extra fees are additional usable funds, while the 50% deposit pool is
  // still derived from the original deposit amount.
  summaryTotals.depositBalance = summaryTotals.halfAmount + summaryTotals.totalExtraFees;
  summaryTotals.receivedTotal = summaryTotals.totalWithdrawn;

  const visibleDateKeys = (dDateFrom || dDateTo) ? availableDateKeys.filter((dateKey) => (!dDateFrom || dateKey >= dDateFrom) && (!dDateTo || dateKey <= dDateTo)) : availableDateKeys;

  const filteredRows = (members || [])
    .filter((member) => memberMatchesFilters(member))
    .filter((member) => {
      const memberId = String(member._id);
      if (dTransactionStatus === 'done') return doneMemberIds.has(memberId);
      if (dTransactionStatus === 'pending') return pendingMemberIds.has(memberId);
      return true;
    })
    .filter((member) => {
      const text = `${member.name || ''} ${member.jNo || ''} ${member.villageName || ''}`.toLowerCase();
      return !dSearchTerm || text.includes(dSearchTerm.toLowerCase());
    })
    .map((member, index) => {
      const memberId = String(member._id);
      const memberTransactions = dTransactionStatus === 'pending'
        ? []
        : rangeTransactions.filter((transaction) => String(transaction.member?._id || transaction.member || '') === memberId);

      const cells = {};
      let totalDeposited = 0;
      let totalWithdrawn = 0;

      visibleDateKeys.forEach((dateKey) => {
        const cell = { deposit: 0, withdrawal: 0 };
        memberTransactions.forEach((transaction) => {
          if (toDateKey(transaction.date) !== dateKey) return;
          const value = Number(transaction.amount || 0);
          if (transaction.type === 'deposit') cell.deposit += value;
          if (transaction.type === 'withdrawal') cell.withdrawal += value;
        });
        cells[dateKey] = cell;
        totalDeposited += cell.deposit;
        totalWithdrawn += cell.withdrawal;
      });

      return {
        sNo: index + 1,
        memberId: member._id,
        jNo: member.jNo,
        name: member.name,
        villageName: member.villageName || '',
        createdByWorker: member.createdByWorker || '',
        cells,
        totalDeposited,
        totalWithdrawn,
        halfAmount: totalDeposited / 2,
        pendingBalance: totalDeposited * 0.5 - totalWithdrawn,
      };
    });

  const filteredGrandTotals = filteredRows.reduce(
    (acc, row) => {
      acc.totalDeposited += Number(row.totalDeposited || 0);
      acc.totalWithdrawn += Number(row.totalWithdrawn || 0);
      acc.pendingBalance += Number(row.pendingBalance || 0);
      return acc;
    },
    { totalDeposited: 0, totalWithdrawn: 0, pendingBalance: 0 }
  );
  filteredGrandTotals.halfAmount = filteredGrandTotals.totalDeposited / 2;

  const clearAllFilters = () => {
    // Wipes URL params + sessionStorage cache + active state (hook), then
    // refetches the grid with default criteria. The mount effect below would
    // handle village/worker changes too, but an explicit fetch covers the
    // case where the persisted selection already matched the defaults.
    resetFilters();
    setDeleteRange({ startDate: '', endDate: '' });
    fetchGrid('', '');
  };

  const handleToggleAdvancedTools = () => {
    if (showAdvancedTools) {
      // Collapsing: reset the date-range filters and close the delete modal so
      // no filtering stays silently applied while the advanced tools are hidden.
      setDateFrom('');
      setDateTo('');
      setDeleteRangeOpen(false);
      setDangerOpen(false);
    }
    setShowAdvancedTools((prev) => !prev);
  };

  const hasDateRange = Boolean(dateFrom || dateTo);
  const hasSelectedFilters = Boolean(dateFrom || dateTo || selectedVillage || selectedWorker);

  /* ── Worker pivot export (.xlsx: name | j.no | worker | dates… | total | half) ── */

  const handleExportWorkerSheet = () => {
    if (exportingWorkerSheet) return;
    if (filteredRows.length === 0) {
      const message = 'Nothing to export — no workers match the current filters.';
      setError(message);
      showToast(message, 'error', 'Export Failed');
      return;
    }

    setExportingWorkerSheet(true);
    // Yield one frame so the loading state paints before the synchronous
    // workbook generation starts.
    window.setTimeout(() => {
      try {
        // Pivot exactly what the ledger table shows: the same rows and the
        // same visible date columns (already narrowed by the date filters).
        const pivot = buildWorkerPivotFromGrid(filteredRows, visibleDateKeys);
        const exported = exportWorkerPivotXlsx(pivot, { dateFrom, dateTo, sheetName: 'Worker Sheet' });
        if (exported) {
          showToast(
            `Worker sheet exported (${pivot.rows.length} workers, ${pivot.dates.length} dates).`,
            'success',
            'Worker Sheet Exported'
          );
          setError('');
        } else {
          const message = 'No transaction data to export.';
          setError(message);
          showToast(message, 'error', 'Export Failed');
        }
      } catch (err) {
        const message = `Failed to generate the worker sheet: ${err.response?.data?.message || err.message || err}`;
        setError(message);
        showToast(message, 'error', 'Export Failed');
      } finally {
        setExportingWorkerSheet(false);
      }
    }, 50);
  };

  return (
    <div className="min-h-screen bg-canvas">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Workers Payments Overview</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Deposits, received payments and pending balances across every worker and village.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchGrid(selectedVillage, selectedWorker)}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink-soft shadow-sm transition-colors hover:bg-subtle hover:text-ink"
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              type="button"
              onClick={handleToggleAdvancedTools}
              aria-expanded={showAdvancedTools}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition-colors duration-200 ${
                showAdvancedTools
                  ? 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200'
                  : 'border border-line bg-surface text-ink-soft hover:bg-subtle'
              }`}
            >
              <SlidersHorizontal
                size={16}
                className={`transition-transform duration-300 ${showAdvancedTools ? 'rotate-90' : ''}`}
              />
              {showAdvancedTools ? 'Hide Advanced Tools' : 'Advanced Tools'}
            </button>
          </div>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <AlertTriangle size={16} className="shrink-0" /> {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            {successMessage}
          </div>
        )}

        {/* Filter & Action Bar */}
        <div className="mb-6 overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="min-w-[220px] flex-1">
                <label htmlFor="ledger-search" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Search
                </label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                  <input
                    id="ledger-search"
                    value={searchTerm || ''}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Member name, J.No or village…"
                    className="w-full rounded-lg border border-line-strong bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
              </div>

              <div className="w-full lg:w-44">
                <label htmlFor="filter-village" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Village
                </label>
                <select
                  id="filter-village"
                  value={selectedVillage || ''}
                  onChange={(e) => setSelectedVillage(e.target.value)}
                  className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value="">All Villages</option>
                  {(grid?.villages || []).map((village) => (
                    <option key={village} value={village}>
                      {village}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full lg:w-44">
                <label htmlFor="filter-worker" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Worker
                </label>
                <select
                  id="filter-worker"
                  value={selectedWorker || ''}
                  onChange={(e) => setSelectedWorker(e.target.value)}
                  className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value="">All Workers</option>
                  {workers.map((worker) => (
                    <option key={worker} value={worker}>
                      {worker}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full lg:w-56">
                <label htmlFor="filter-status" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Status
                </label>
                <select
                  id="filter-status"
                  value={transactionStatus}
                  onChange={(e) => setTransactionStatus(e.target.value)}
                  className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value="all">All Users</option>
                  <option value="done">Completed / Done</option>
                  <option value="pending">No Transactions / Pending</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink-soft shadow-sm transition-colors hover:bg-subtle hover:text-ink"
                >
                  Clear Filters
                </button>
                <button
                  type="button"
                  onClick={handleExportWorkerSheet}
                  disabled={exportingWorkerSheet || loading}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-600/40 text-white font-medium px-4 py-2 rounded-lg shadow-sm flex items-center gap-2"
                >
                  {exportingWorkerSheet
                    ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    : <FileSpreadsheet size={16} aria-hidden="true" />}
                  {exportingWorkerSheet ? 'Preparing…' : 'Export Worker Sheet'}
                </button>
              </div>
            </div>

            {showAdvancedTools && (
              <div className="mt-4 flex flex-col gap-3 border-t border-line/70 pt-4 animate-fade-slide-down lg:flex-row lg:items-end">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="w-full sm:w-44">
                    <label htmlFor="date-from" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
                      From date
                    </label>
                    <div className="relative">
                      <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                      <input
                        id="date-from"
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full rounded-lg border border-line-strong bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                    </div>
                  </div>

                  <div className="w-full sm:w-44">
                    <label htmlFor="date-to" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
                      To date
                    </label>
                    <div className="relative">
                      <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                      <input
                        id="date-to"
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full rounded-lg border border-line-strong bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink-soft shadow-sm transition-colors hover:bg-subtle hover:text-ink"
                  >
                    All Time
                  </button>
                </div>

                {/* Danger Zone */}
                <div className="relative lg:ml-auto">
                  <button
                    type="button"
                    onClick={() =>
                      setDangerOpen((prev) => {
                        const next = !prev;
                        if (next) {
                          // Prefill the danger-zone inputs from the active date
                          // filters so the delete targets the range on screen.
                          setDeleteRange((prevRange) => ({
                            startDate: prevRange.startDate || dateFrom,
                            endDate: prevRange.endDate || dateTo,
                          }));
                        }
                        return next;
                      })
                    }
                    aria-expanded={dangerOpen}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-surface px-3.5 py-2 text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    <AlertTriangle size={15} /> Danger Zone
                    <ChevronDown size={14} className={`transition-transform duration-200 ${dangerOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {dangerOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setDangerOpen(false)} />
                      <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-red-200 bg-surface p-4 shadow-xl animate-fade-slide-down dark:border-red-900">
                        <p className="text-sm font-semibold text-red-800 dark:text-red-300">Delete transactions by date range</p>
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          This permanently removes every transaction in the selected range.
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="text-xs font-medium text-ink-soft">
                            Start date
                            <input
                              type="date"
                              value={deleteRange.startDate}
                              onChange={(e) => setDeleteRange((prev) => ({ ...prev, startDate: e.target.value }))}
                              className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                            />
                          </label>
                          <label className="text-xs font-medium text-ink-soft">
                            End date
                            <input
                              type="date"
                              value={deleteRange.endDate}
                              onChange={(e) => setDeleteRange((prev) => ({ ...prev, endDate: e.target.value }))}
                              className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDangerOpen(false);
                            requestDeleteRange();
                          }}
                          className="mt-3 w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                        >
                          Delete All Transactions
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {grid && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard
              label={hasSelectedFilters || transactionStatus !== 'all' ? 'Active Users' : 'Total / Active Users'}
              value={activeUserCount}
              icon={Users}
              color="blue"
            />
            <MetricCard label="Total Base Amount" value={summaryTotals.totalDeposited} icon={PiggyBank} color="green" />
            <MetricCard label="Total Extra Fees" value={summaryTotals.totalExtraFees} icon={ArrowDownCircle} color="green" />
            <MetricCard label="Total Deposit Balance" value={summaryTotals.depositBalance} icon={Scale} color="blue" />
            <MetricCard label="Received Payment Total" value={summaryTotals.receivedTotal} icon={ArrowDownCircle} color="amber" />
          </div>
        )}

        {grid && filteredRows.length === 0 && !hasDateRange && dTransactionStatus === 'all' && (
          <div className="mb-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            No users match the current filters.
          </div>
        )}

        {grid && filteredRows.length === 0 && (hasDateRange || dTransactionStatus !== 'all') && (
          <div className="mb-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {dTransactionStatus === 'pending'
              ? 'No pending users found for the selected date range.'
              : 'No matching users or transactions found for the selected filters.'}
          </div>
        )}

        {/* Full-page splash only for the very first load. Every later refresh
            or filter change keeps the previous table mounted and shows a
            subtle overlay instead — no unmount/remount blink. */}
        {!grid && (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <RefreshCw size={18} className="animate-spin text-brand-500" /> Loading ledger sheet...
          </div>
        )}
        {grid && (
          <div
            className={`relative transition-opacity duration-200 ${
              gridUpdating || isFiltering ? 'opacity-60 saturate-50' : 'opacity-100 saturate-100'
            }`}
          >
            {(gridUpdating || isFiltering) && (
              <div className="pointer-events-none absolute inset-x-0 -top-3 z-10 flex justify-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-medium text-ink-soft shadow-sm">
                  <RefreshCw size={12} className="animate-spin text-brand-500" />
                  Updating…
                </span>
              </div>
            )}
            <LedgerTable
              dates={visibleDateKeys}
              rows={filteredRows}
              grandTotals={filteredGrandTotals}
              selectedVillage={dSelectedVillage}
              selectedWorker={dSelectedWorker}
              searchTerm={dSearchTerm}
              selectedDate={''}
            />

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {dTransactionStatus === 'pending'
                    ? 'Pending Users'
                    : dTransactionStatus === 'done'
                      ? 'Completed Transactions'
                      : 'All Transactions'}
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-500">{rangeTransactions.length} record(s)</span>
              </div>

              {rangeTransactions.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {dTransactionStatus === 'pending'
                    ? 'No transactions found for the selected date range, so all matching users are pending.'
                    : 'No transactions found for the selected filters.'}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {rangeTransactions
                    .slice()
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((transaction) => (
                      <div
                        key={String(transaction._id)}
                        className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/50 p-3.5 transition-colors hover:border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {transaction.member?.name || 'Member'}{' '}
                            <span className="font-normal text-slate-500 dark:text-slate-500">({transaction.member?.jNo || '—'})</span>
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(transaction.date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                            {transaction.note ? ` • ${transaction.note}` : ''}
                          </p>
                          <p className="mt-1 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-500">
                            Base: ₹{Number(transaction.amount || 0).toLocaleString('en-IN')} • Extra: ₹
                            {Number(transaction.extraFee || 0).toLocaleString('en-IN')} • Total: ₹
                            {(Number(transaction.amount || 0) / 2 + Number(transaction.extraFee || 0)).toLocaleString('en-IN')}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-sm font-semibold tabular-nums ring-1 ring-inset ${
                            transaction.type === 'deposit'
                              ? 'bg-emerald-50 text-emerald-600 ring-emerald-600/20 dark:bg-emerald-950/60 dark:text-emerald-400 dark:ring-emerald-400/30'
                              : 'bg-amber-50 text-amber-600 ring-amber-600/20 dark:bg-amber-950/60 dark:text-amber-400 dark:ring-amber-400/30'
                          }`}
                        >
                          {transaction.type === 'deposit' ? '+' : '-'}₹
                          {(Number(transaction.amount || 0) / 2 + Number(transaction.extraFee || 0)).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Danger-Zone confirmation prompt — rendered outside the advanced-tools
          gate so it is always visible once a delete has been requested. */}
      <ConfirmModal
        open={deleteRangeOpen}
        title="Delete filtered transactions"
        message={
          pendingDeleteFilters
            ? `This permanently removes every transaction between ${pendingDeleteFilters.startDate} and ${pendingDeleteFilters.endDate}` +
              `${pendingDeleteFilters.worker ? ` for worker "${pendingDeleteFilters.worker}"` : ''}` +
              `${pendingDeleteFilters.village ? ` in village "${pendingDeleteFilters.village}"` : ''}. This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete All"
        onConfirm={confirmDeleteRange}
        onCancel={() => setDeleteRangeOpen(false)}
      />
    </div>
  );
};

export default Dashboard;
