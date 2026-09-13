import React, { useEffect, useState } from 'react';
import { RefreshCw, PiggyBank, ArrowDownCircle, Scale, Users, CalendarDays } from 'lucide-react';
import Navbar from '../components/Navbar';
import LedgerTable from '../components/LedgerTable';
import MetricCard from '../components/MetricCard';
import api from '../api/axios';

const toDateKey = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Dashboard = () => {
  const [grid, setGrid] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedVillage, setSelectedVillage] = useState('');
  const [selectedWorker, setSelectedWorker] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [workers, setWorkers] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [transactionStatus, setTransactionStatus] = useState('all');

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
      const value = amount + extra;
      if (transaction.type === 'deposit') acc.totalDeposited += value;
      else if (transaction.type === 'withdrawal') acc.totalWithdrawn += value;
      acc.totalExtraFees += extra;
      return acc;
    },
    { totalDeposited: 0, totalWithdrawn: 0, totalExtraFees: 0 }
  );
  summaryTotals.halfAmount = summaryTotals.totalDeposited / 2;
  summaryTotals.netBalance = summaryTotals.totalDeposited - summaryTotals.totalWithdrawn;

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
          const fee = Number(transaction.extraFee || 0);
          const value = Number(transaction.amount || 0) + fee;
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
        pendingBalance: totalDeposited - totalWithdrawn,
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

  const hasDateRange = Boolean(dateFrom || dateTo);
  const hasSelectedFilters = Boolean(dateFrom || dateTo || selectedVillage || selectedWorker);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">WORKERS PAYMENTS OVERVIEW</h1>
          </div>

          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
              <CalendarDays size={16} className="text-gray-500" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border-0 bg-transparent text-sm text-gray-700 focus:outline-none"
                placeholder="From date"
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
              <CalendarDays size={16} className="text-gray-500" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border-0 bg-transparent text-sm text-gray-700 focus:outline-none"
                placeholder="To date"
              />
            </div>

            <select
              value={transactionStatus}
              onChange={(e) => setTransactionStatus(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="all">All Users</option>
              <option value="done">Transactions Completed / Done</option>
              <option value="pending">No Transactions / Pending</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              All Time
            </button>

            <button
              type="button"
              onClick={clearAllFilters}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Clear Filters
            </button>

            <button
              type="button"
              onClick={() => fetchGrid(selectedVillage, selectedWorker)}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </div>

        {grid && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <MetricCard
              label={hasSelectedFilters || transactionStatus !== 'all' ? 'Active Users' : 'Total / Active Users'}
              value={activeUserCount}
              icon={Users}
              color="blue"
            />
            <MetricCard label="Total Base Amount" value={summaryTotals.totalDeposited} icon={PiggyBank} color="green" />
            <MetricCard label="Total Extra Fees" value={summaryTotals.totalExtraFees} icon={ArrowDownCircle} color="green" />
            <MetricCard label="Total Half Amount" value={summaryTotals.halfAmount} icon={Scale} color="blue" />
            <MetricCard label="Net Balance" value={summaryTotals.netBalance} icon={Scale} color="red" />
          </div>
        )}

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {!loading && filteredRows.length === 0 && !hasDateRange && transactionStatus === 'all' && (
          <div className="mb-4 text-sm text-gray-600 bg-white border border-dashed border-gray-300 rounded-lg px-4 py-3">
            No users match the current filters.
          </div>
        )}

        {!loading && filteredRows.length === 0 && (hasDateRange || transactionStatus !== 'all') && (
          <div className="mb-4 text-sm text-gray-600 bg-white border border-dashed border-gray-300 rounded-lg px-4 py-3">
            {transactionStatus === 'pending'
              ? 'No pending users found for the selected date range.'
              : 'No matching users or transactions found for the selected filters.'}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading ledger sheet...</div>
        ) : (
          <>
            <LedgerTable
              dates={visibleDateKeys}
              rows={filteredRows}
              grandTotals={filteredGrandTotals}
              villages={grid?.villages || []}
              workers={workers}
              selectedVillage={selectedVillage}
              setSelectedVillage={setSelectedVillage}
              selectedWorker={selectedWorker}
              setSelectedWorker={setSelectedWorker}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              selectedDate={''}
            />

            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-600 uppercase">
                  {transactionStatus === 'pending'
                    ? 'Pending Users'
                    : transactionStatus === 'done'
                      ? 'Completed Transactions'
                      : 'All Transactions'}
                </h2>
              </div>

              {rangeTransactions.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {transactionStatus === 'pending'
                    ? 'No transactions found for the selected date range, so all matching users are pending.'
                    : 'No transactions found for the selected filters.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {rangeTransactions
                    .slice()
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((transaction) => (
                      <div key={String(transaction._id)} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3">
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {transaction.member?.name || 'Member'} <span className="text-gray-400">({transaction.member?.jNo || '—'})</span>
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(transaction.date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                            {transaction.note ? ` • ${transaction.note}` : ''}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-1">
                            Base: ₹{Number(transaction.amount || 0).toLocaleString('en-IN')} • Extra: ₹{Number(transaction.extraFee || 0).toLocaleString('en-IN')} • Total: ₹{(Number(transaction.amount || 0) + Number(transaction.extraFee || 0)).toLocaleString('en-IN')}
                          </p>
                        </div>
                        <span
                          className={`text-sm font-semibold ${
                            transaction.type === 'deposit' ? 'text-green-700' : 'text-amber-700'
                          }`}
                        >
                          {transaction.type === 'deposit' ? '+' : '-'}₹{(Number(transaction.amount || 0) + Number(transaction.extraFee || 0)).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
