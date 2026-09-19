import React, { useEffect, useState } from 'react';
import { RefreshCw, PiggyBank, ArrowDownCircle, Scale, Users, CalendarDays, Download, SlidersHorizontal, Search, AlertTriangle, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import Navbar from '../components/Navbar';
import LedgerTable from '../components/LedgerTable';
import MetricCard from '../components/MetricCard';
import ConfirmModal from '../components/ConfirmModal';
import api from '../api/axios';

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
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedVillage, setSelectedVillage] = useState('');
  const [selectedWorker, setSelectedWorker] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [workers, setWorkers] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [transactionStatus, setTransactionStatus] = useState('all');
  const [deleteRangeOpen, setDeleteRangeOpen] = useState(false);
  const [deleteRange, setDeleteRange] = useState({ startDate: '', endDate: '' });
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);

  const fetchGrid = async (village = selectedVillage, worker = selectedWorker) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/transactions/ledger/grid', {
        params: {
          ...(village ? { village } : {}),
          ...(worker ? { worker } : {}),
        },
      });
      setGrid(res.data);
      if (res.data.workers) setWorkers(res.data.workers);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load ledger sheet');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await api.get('/transactions');
      setTransactions(res.data.transactions || []);
    } catch (err) {
      setTransactions([]);
    }
  };

  const fetchMembers = async () => {
    try {
      const res = await api.get('/members');
      setMembers(res.data.members || []);
    } catch (err) {
      setMembers([]);
    }
  };

  const requestDeleteRange = () => {
    if (!deleteRange.startDate || !deleteRange.endDate) {
      setError('Please select both a start date and an end date.');
      return;
    }
    if (deleteRange.startDate > deleteRange.endDate) {
      setError('Start date cannot be after end date.');
      return;
    }
    setError('');
    setDeleteRangeOpen(true);
  };

  const confirmDeleteRange = async () => {
    try {
      const res = await api.delete('/transactions/delete-range', { params: deleteRange });
      setDeleteRangeOpen(false);
      setSuccessMessage(`${res.data.deletedCount || 0} transaction(s) deleted successfully.`);
      await Promise.all([fetchGrid(selectedVillage, selectedWorker), fetchTransactions()]);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete transactions for the selected range');
      setDeleteRangeOpen(false);
    }
  };

  useEffect(() => {
    fetchGrid(selectedVillage, selectedWorker);
    fetchTransactions();
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVillage, selectedWorker]);

  const memberMatchesFilters = (member) => {
    const villageName = (member.villageName || '').trim().toLowerCase();
    const workerName = (member.createdByWorker || '').trim().toLowerCase();
    const matchesVillage = !selectedVillage || villageName === selectedVillage.trim().toLowerCase();
    const matchesWorker = !selectedWorker || workerName === selectedWorker.trim().toLowerCase();
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
    if (dateFrom && dateKey < dateFrom) return false;
    if (dateTo && dateKey > dateTo) return false;
    return true;
  });

  const doneMemberIds = new Set(
    rangeTransactions.map((transaction) => String(transaction.member?._id || transaction.member || ''))
  );
  const pendingMemberIds = new Set(allMemberIds.filter((memberId) => !doneMemberIds.has(memberId)));
  const hasActiveFilters = Boolean(dateFrom || dateTo || selectedVillage || selectedWorker || transactionStatus !== 'all');

  const statusMemberIds =
    transactionStatus === 'done'
      ? doneMemberIds
      : transactionStatus === 'pending'
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
  summaryTotals.depositBalance = summaryTotals.halfAmount;
  summaryTotals.receivedTotal = summaryTotals.totalWithdrawn;

  const visibleDateKeys = (dateFrom || dateTo) ? availableDateKeys.filter((dateKey) => (!dateFrom || dateKey >= dateFrom) && (!dateTo || dateKey <= dateTo)) : availableDateKeys;

  const filteredRows = (members || [])
    .filter((member) => memberMatchesFilters(member))
    .filter((member) => {
      const memberId = String(member._id);
      if (transactionStatus === 'done') return doneMemberIds.has(memberId);
      if (transactionStatus === 'pending') return pendingMemberIds.has(memberId);
      return true;
    })
    .filter((member) => {
      const text = `${member.name || ''} ${member.jNo || ''} ${member.villageName || ''}`.toLowerCase();
      return !searchTerm || text.includes(searchTerm.toLowerCase());
    })
    .map((member, index) => {
      const memberId = String(member._id);
      const memberTransactions = transactionStatus === 'pending'
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
    setDateFrom('');
    setDateTo('');
    setSelectedVillage('');
    setSelectedWorker('');
    setSearchTerm('');
    setTransactionStatus('all');
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

  const formatExportDate = (value) => {
    if (!value) return 'All';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return 'All';
    return `${String(date.getDate()).padStart(2, '0')}${date.toLocaleString('en-US', { month: 'short' })}`;
  };

  const exportFilteredTransactions = () => {
    const exportSource = [...transactions]
      .filter((transaction) => {
        const memberId = String(transaction.member?._id || transaction.member || '');
        if (!allMemberSet.has(memberId)) return false;

        const dateKey = toDateKey(transaction.date);
        if (!dateKey) return false;
        if (dateFrom && dateKey < dateFrom) return false;
        if (dateTo && dateKey > dateTo) return false;

        if (!searchTerm) return true;

        const memberName = transaction.member?.name || '';
        const memberJNo = transaction.member?.jNo || '';
        const villageName = transaction.member?.villageName || transaction.villageName || '';
        const searchText = `${memberName} ${memberJNo} ${villageName}`.toLowerCase();
        return searchText.includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const rows = exportSource.map((transaction) => {
      const baseAmount = Number(transaction.amount || 0);
      const extraFee = Number(transaction.extraFee || 0);
      const originalEnteredAmount = transaction.type === 'deposit'
        ? Number(transaction.originalEnteredAmount ?? baseAmount)
        : baseAmount;
      const effectiveAmount = transaction.type === 'deposit'
        ? Number(transaction.effectiveDepositBalance ?? baseAmount * 0.5)
        : baseAmount;
      const remainingBalance = transaction.type === 'deposit'
        ? Number(transaction.remainingBalance ?? effectiveAmount)
        : 0;
      const halfAmount = transaction.type === 'deposit' ? effectiveAmount : baseAmount;
      const totalAmount = halfAmount + extraFee;

      return {
        Date: new Date(transaction.date).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        'User Name': transaction.member?.name || '—',
        Phone: transaction.member?.phone || '—',
        Village: transaction.member?.villageName || transaction.villageName || '—',
        Worker: transaction.member?.createdByWorker || '—',
        Type: transaction.type === 'deposit' ? 'Deposit' : 'Withdrawal',
        'Original Entered Amount': Number(originalEnteredAmount.toFixed(2)),
        'Effective Deposit Balance (50%)': Number(effectiveAmount.toFixed(2)),
        'Remaining Deposit Balance': Number(remainingBalance.toFixed(2)),
        'Extra Fee': Number(extraFee.toFixed(2)),
        'Usable Amount': Number(halfAmount.toFixed(2)),
        'Total Amount': Number(totalAmount.toFixed(2)),
        Status: transactionStatus === 'pending' ? 'Pending' : 'Completed',
        Notes: transaction.note || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{
      Date: '',
      'User Name': '',
      Phone: '',
      Village: '',
      Worker: '',
      Type: '',
      'Base Amount': '',
      'Extra Fee (+100)': '',
      'Half Amount (50%)': '',
      'Total Amount': '',
      Status: '',
      Notes: '',
    }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');

    const fileName = dateFrom || dateTo
      ? `Transactions_${formatExportDate(dateFrom || dateTo)}_to_${formatExportDate(dateTo || dateFrom)}.xlsx`
      : 'All_Transactions.xlsx';

    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Workers Payments Overview</h1>
            <p className="mt-1 text-sm text-slate-500">
              Deposits, received payments and pending balances across every worker and village.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchGrid(selectedVillage, selectedWorker)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              type="button"
              onClick={handleToggleAdvancedTools}
              aria-expanded={showAdvancedTools}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition-colors duration-200 ${
                showAdvancedTools
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
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
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} className="shrink-0" /> {error}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        )}

        {/* Filter & Action Bar */}
        <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="min-w-[220px] flex-1">
                <label htmlFor="ledger-search" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Search
                </label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="ledger-search"
                    value={searchTerm || ''}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Member name, J.No or village…"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
              </div>

              <div className="w-full lg:w-44">
                <label htmlFor="filter-village" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Village
                </label>
                <select
                  id="filter-village"
                  value={selectedVillage || ''}
                  onChange={(e) => setSelectedVillage(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
                <label htmlFor="filter-worker" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Worker
                </label>
                <select
                  id="filter-worker"
                  value={selectedWorker || ''}
                  onChange={(e) => setSelectedWorker(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
                <label htmlFor="filter-status" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Status
                </label>
                <select
                  id="filter-status"
                  value={transactionStatus}
                  onChange={(e) => setTransactionStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  Clear Filters
                </button>
                <button
                  type="button"
                  onClick={exportFilteredTransactions}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-lg shadow-sm flex items-center gap-2"
                >
                  <Download size={16} /> Export to Excel
                </button>
              </div>
            </div>

            {showAdvancedTools && (
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 animate-fade-slide-down lg:flex-row lg:items-end">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="w-full sm:w-44">
                    <label htmlFor="date-from" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                      From date
                    </label>
                    <div className="relative">
                      <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="date-from"
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                    </div>
                  </div>

                  <div className="w-full sm:w-44">
                    <label htmlFor="date-to" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                      To date
                    </label>
                    <div className="relative">
                      <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="date-to"
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    All Time
                  </button>
                </div>

                {/* Danger Zone */}
                <div className="relative lg:ml-auto">
                  <button
                    type="button"
                    onClick={() => setDangerOpen((prev) => !prev)}
                    aria-expanded={dangerOpen}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-50"
                  >
                    <AlertTriangle size={15} /> Danger Zone
                    <ChevronDown size={14} className={`transition-transform duration-200 ${dangerOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {dangerOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setDangerOpen(false)} />
                      <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-red-100 bg-white p-4 shadow-xl animate-fade-slide-down">
                        <p className="text-sm font-semibold text-red-800">Delete transactions by date range</p>
                        <p className="mt-1 text-xs text-red-600">
                          This permanently removes every transaction in the selected range.
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="text-xs font-medium text-slate-600">
                            Start date
                            <input
                              type="date"
                              value={deleteRange.startDate}
                              onChange={(e) => setDeleteRange((prev) => ({ ...prev, startDate: e.target.value }))}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            End date
                            <input
                              type="date"
                              value={deleteRange.endDate}
                              onChange={(e) => setDeleteRange((prev) => ({ ...prev, endDate: e.target.value }))}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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

        {!loading && filteredRows.length === 0 && !hasDateRange && transactionStatus === 'all' && (
          <div className="mb-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
            No users match the current filters.
          </div>
        )}

        {!loading && filteredRows.length === 0 && (hasDateRange || transactionStatus !== 'all') && (
          <div className="mb-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
            {transactionStatus === 'pending'
              ? 'No pending users found for the selected date range.'
              : 'No matching users or transactions found for the selected filters.'}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500 shadow-sm">
            <RefreshCw size={18} className="animate-spin text-brand-500" /> Loading ledger sheet...
          </div>
        ) : (
          <>
            <LedgerTable
              dates={visibleDateKeys}
              rows={filteredRows}
              grandTotals={filteredGrandTotals}
              selectedVillage={selectedVillage}
              selectedWorker={selectedWorker}
              searchTerm={searchTerm}
              selectedDate={''}
            />

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {transactionStatus === 'pending'
                    ? 'Pending Users'
                    : transactionStatus === 'done'
                      ? 'Completed Transactions'
                      : 'All Transactions'}
                </h2>
                <span className="text-xs text-slate-400">{rangeTransactions.length} record(s)</span>
              </div>

              {rangeTransactions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {transactionStatus === 'pending'
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
                        className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/50 p-3.5 transition-colors hover:border-slate-200 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">
                            {transaction.member?.name || 'Member'}{' '}
                            <span className="font-normal text-slate-400">({transaction.member?.jNo || '—'})</span>
                          </p>
                          <p className="text-xs text-slate-500">
                            {new Date(transaction.date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                            {transaction.note ? ` • ${transaction.note}` : ''}
                          </p>
                          <p className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
                            Base: ₹{Number(transaction.amount || 0).toLocaleString('en-IN')} • Extra: ₹
                            {Number(transaction.extraFee || 0).toLocaleString('en-IN')} • Total: ₹
                            {(Number(transaction.amount || 0) / 2 + Number(transaction.extraFee || 0)).toLocaleString('en-IN')}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-sm font-semibold tabular-nums ring-1 ring-inset ${
                            transaction.type === 'deposit'
                              ? 'bg-emerald-50 text-emerald-600 ring-emerald-600/20'
                              : 'bg-amber-50 text-amber-600 ring-amber-600/20'
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
          </>
        )}
      </main>

      {showAdvancedTools && (
        <ConfirmModal
          open={deleteRangeOpen}
          title="Delete transactions by date range"
          message={`Are you sure you want to delete all transactions between ${deleteRange.startDate} and ${deleteRange.endDate}?`}
          confirmLabel="Delete All"
          onConfirm={confirmDeleteRange}
          onCancel={() => setDeleteRangeOpen(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;
