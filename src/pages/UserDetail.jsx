import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, PiggyBank, Scale, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import Navbar from '../components/Navbar';
import MetricCard from '../components/MetricCard';
import api from '../api/axios';

const UserDetail = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
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
    fetchSummary();
  }, [id]);

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
                    <div key={t.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-full ${
                            t.type === 'deposit' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {t.type === 'deposit' ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {t.type === 'deposit' ? 'Deposit' : 'Received / Withdrawal'}
                          </p>
                          <p className="text-xs text-gray-500">
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
          </>
        ) : null}
      </main>
    </div>
  );
};

export default UserDetail;
