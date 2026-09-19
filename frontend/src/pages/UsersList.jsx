import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight, X, Users } from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../api/axios';

const cardPalettes = [
  {
    card: 'bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100',
    action: 'border-indigo-200/80 bg-white/60 text-slate-800 hover:bg-white/85',
  },
  {
    card: 'bg-gradient-to-br from-teal-100 via-emerald-100 to-cyan-100',
    action: 'border-emerald-200/80 bg-white/60 text-slate-800 hover:bg-white/85',
  },
  {
    card: 'bg-gradient-to-br from-amber-100 via-orange-100 to-yellow-100',
    action: 'border-amber-200/80 bg-white/60 text-slate-800 hover:bg-white/85',
  },
  {
    card: 'bg-gradient-to-br from-fuchsia-100 via-pink-100 to-purple-100',
    action: 'border-fuchsia-200/80 bg-white/60 text-slate-800 hover:bg-white/85',
  },
  {
    card: 'bg-gradient-to-br from-sky-100 via-blue-100 to-teal-100',
    action: 'border-sky-200/80 bg-white/60 text-slate-800 hover:bg-white/85',
  },
];

const UsersList = () => {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await api.get('/members');
        setMembers(res.data.members);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, []);

  const filtered = members.filter((m) => {
    const query = search.toLowerCase();
    return (
      String(m.name || '').toLowerCase().includes(query) ||
      String(m.jNo || '').toLowerCase().includes(query) ||
      String(m.villageName || '').toLowerCase().includes(query) ||
      String(m.createdByWorker || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">User Detail View</h1>
            <p className="mt-1 text-sm text-slate-500">
              Search the directory and open a member card to view their complete ledger history.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
            <Users size={16} className="text-indigo-600" />
            <span className="font-mono font-semibold tabular-nums text-slate-900">{filtered.length}</span>
            <span>of {members.length}</span>
          </div>
        </div>

        <div className="relative mb-6 max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, J.No, village or admin..."
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {loading ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading members...</p>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">No members found.</p>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((m, index) => {
              const palette = cardPalettes[index % cardPalettes.length];
              return (
                <Link
                  key={m._id}
                  to={`/users/${m._id}`}
                  className={`group no-underline hover:no-underline flex h-full min-h-[180px] flex-col rounded-3xl border border-white/70 p-4 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] transition-transform duration-200 ease-out hover:-translate-y-1.5 hover:shadow-[0_20px_35px_-8px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,1)] ${palette.card}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="worker-nav-link min-w-0 truncate font-bold tracking-tight text-slate-900" title={m.name}>
                      {m.name}
                    </p>
                    <span className="shrink-0 rounded-full bg-slate-900/10 px-2 py-0.5 font-mono text-xs font-medium text-slate-800 shadow-sm backdrop-blur-md">
                      {m.jNo || '—'}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1">
                    <p className="truncate text-sm font-medium text-slate-600" title={m.villageName || 'No village'}>
                      {m.villageName || 'No village'}
                    </p>
                    <p className="truncate text-xs text-slate-600" title={String(m.createdByWorker || '').trim() || 'Unassigned'}>
                      Admin: <span className="font-semibold text-slate-800">{String(m.createdByWorker || '').trim() || 'Unassigned'}</span>
                    </p>
                  </div>
                  <span className={`mt-auto inline-flex items-center justify-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-bold shadow-sm transition-all duration-200 group-hover:scale-[1.03] group-hover:shadow-md ${palette.action}`}>
                    Open ledger
                    <ChevronRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default UsersList;
