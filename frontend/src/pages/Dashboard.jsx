import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Navbar from '../components/Navbar';
import LedgerTable from '../components/LedgerTable';
import MetricCard from '../components/MetricCard';
import { PiggyBank, ArrowDownCircle, Scale, Users, CalendarDays } from 'lucide-react';
import api from '../api/axios';

const today = () => new Date().toISOString().slice(0, 10);

const Dashboard = () => {
  const [grid, setGrid] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedVillage, setSelectedVillage] = useState('');
  const [selectedWorker, setSelectedWorker] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [workers, setWorkers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(today());

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

  useEffect(() => {
    fetchGrid(selectedVillage, selectedWorker);
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVillage, selectedWorker]);

  const filteredTransactions = transactions.filter((t) => {
    const transactionDate = new Date(t.date).toISOString().slice(0, 10);
    return transactionDate === selectedDate;
  });

  const selectedDateSummary = filteredTransactions.reduce(
    (acc, transaction) => {
      if (transaction.type === 'deposit') {
        acc.totalDeposited += Number(transaction.amount || 0);
      } else if (transaction.type === 'withdrawal') {
        acc.totalWithdrawn += Number(transaction.amount || 0);
      }
      return acc;
    },
    { totalDeposited: 0, totalWithdrawn: 0, totalTransactions: filteredTransactions.length }
  );
  selectedDateSummary.netBalance = selectedDateSummary.totalDeposited - selectedDateSummary.totalWithdrawn;

  const filteredRows =
    grid && selectedDate
      ? (grid.rows || [])
          .map((row) => {
            const cell = row.cells?.[selectedDate] || { deposit: 0, withdrawal: 0 };
            const totalDeposited = Number(cell.deposit || 0);
            const totalWithdrawn = Number(cell.withdrawal || 0);

            return {
              ...row,
              cells: { [selectedDate]: cell },
              totalDeposited,
              totalWithdrawn,
              halfAmount: totalDeposited / 2,
              pendingBalance: totalDeposited - totalWithdrawn,
            };
          })
          .filter((row) => {
            const totalForDate = Number(row.totalDeposited || 0) + Number(row.totalWithdrawn || 0);
            return totalForDate > 0;
          })
      : grid?.rows || [];

  const filteredGrandTotals = selectedDate
    ? {
        totalDeposited: selectedDateSummary.totalDeposited,
        totalWithdrawn: selectedDateSummary.totalWithdrawn,
        pendingBalance: selectedDateSummary.netBalance,
        halfAmount: selectedDateSummary.totalDeposited / 2,
      }
    : grid?.grandTotals || { totalDeposited: 0, totalWithdrawn: 0, pendingBalance: 0, halfAmount: 0 };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">WORKERS PAYMENTS OVERVIEW</h1>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
              <CalendarDays size={16} className="text-gray-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value || today())}
                className="border-0 bg-transparent text-sm text-gray-700 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setSelectedDate(today())}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Reset to Today
            </button>

            <button
              onClick={() => fetchGrid(selectedVillage, selectedWorker)}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </div>

        {grid && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Transactions" value={selectedDateSummary.totalTransactions} icon={Users} color="blue" />
            <MetricCard label="Deposits" value={selectedDateSummary.totalDeposited} icon={PiggyBank} color="green" />
            <MetricCard label="Withdrawals" value={selectedDateSummary.totalWithdrawn} icon={ArrowDownCircle} color="green" />
            <MetricCard label="Net Balance" value={selectedDateSummary.netBalance} icon={Scale} color="red" />
          </div>
        )}

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {!loading && filteredTransactions.length === 0 && selectedDate && (
          <div className="mb-4 text-sm text-gray-600 bg-white border border-dashed border-gray-300 rounded-lg px-4 py-3">
            No transactions found for {new Date(selectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading ledger sheet...</div>
        ) : (
          <>
            <LedgerTable
              dates={selectedDate ? [selectedDate] : grid?.dates || []}
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
              selectedDate={selectedDate}
            />

            <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-600 uppercase">Transactions for {selectedDate}</h2>
              </div>

              {filteredTransactions.length === 0 ? (
                <p className="text-sm text-gray-500">No transactions found for {selectedDate}.</p>
              ) : (
                <div className="space-y-3">
                  {filteredTransactions
                    .slice()
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((transaction) => (
                      <div key={transaction._id} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3">
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {transaction.member?.name || 'Member'} <span className="text-gray-400">({transaction.member?.jNo || '—'})</span>
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(transaction.date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}{' '}
                            {new Date(transaction.date).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {transaction.note ? ` • ${transaction.note}` : ''}
                          </p>
                        </div>
                        <span
                          className={`text-sm font-semibold ${
                            transaction.type === 'deposit' ? 'text-green-700' : 'text-amber-700'
                          }`}
                        >
                          {transaction.type === 'deposit' ? '+' : '-'}₹{Number(transaction.amount || 0).toLocaleString('en-IN')}
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
