import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Navbar from '../components/Navbar';
import LedgerTable from '../components/LedgerTable';
import MetricCard from '../components/MetricCard';
import { PiggyBank, ArrowDownCircle, Scale, Users } from 'lucide-react';
import api from '../api/axios';

const Dashboard = () => {
  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedVillage, setSelectedVillage] = useState('');
  const [selectedWorker, setSelectedWorker] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [workers, setWorkers] = useState([]);

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

  useEffect(() => {
    fetchGrid(selectedVillage, selectedWorker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVillage, selectedWorker]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">WORKERS PAYMENTS OVERVIEW</h1>
            {/* <p className="text-sm text-gray-500">Excel-style live view of every member's deposits and withdrawals</p> */}
          </div>
          <button
            onClick={() => fetchGrid(selectedVillage, selectedWorker)}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {grid && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Total Members" value={grid.rows.length} icon={Users} color="blue" />
            <MetricCard label="Total Amount" value={grid.grandTotals.totalDeposited} icon={PiggyBank} color="green" />
            <MetricCard label="Total Received" value={grid.grandTotals.totalWithdrawn} icon={ArrowDownCircle} color="green" />
            <MetricCard label="Net Pending" value={grid.grandTotals.pendingBalance} icon={Scale} color="red" />
          </div>
        )}

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading ledger sheet...</div>
        ) : (
          <LedgerTable
            dates={grid?.dates || []}
            rows={grid?.rows || []}
            grandTotals={grid?.grandTotals}
            villages={grid?.villages || []}
            workers={workers}
            selectedVillage={selectedVillage}
            setSelectedVillage={setSelectedVillage}
            selectedWorker={selectedWorker}
            setSelectedWorker={setSelectedWorker}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
          />
        )}
      </main>
    </div>
  );
};

export default Dashboard;
