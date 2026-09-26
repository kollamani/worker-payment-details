import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight, X, Users } from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../api/axios';

// Neon accent palettes cycled per member card (Neon Pink/Rose, Mint/Cyan,
// Warm Amber, Lavender/Purple, Sky Blue). rgba() values match each accent's
// Tailwind -400 shade so borders, tints and glows stay visually consistent.
// Borders/tints are accent colours that read on both canvases; each `action`
// pill ships a light-surface default plus the frosted-glass dark treatment.
const cardPalettes = [
  {
    border: 'border-rose-400/40 hover:border-rose-400/70',
    tint: 'bg-gradient-to-br from-rose-500/[0.08] via-transparent to-transparent',
    glow: 'shadow-[0_0_18px_rgba(251,113,133,0.16),inset_0_1px_0_rgba(255,255,255,0.07)]',
    glowHover: 'hover:shadow-[0_0_28px_rgba(251,113,133,0.32),inset_0_1px_0_rgba(255,255,255,0.10)]',
    action: 'border-slate-200 bg-slate-50 text-slate-700 hover:border-rose-400/60 hover:bg-rose-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:border-rose-400/40 dark:hover:bg-white/[0.12]',
  },
  {
    border: 'border-cyan-400/40 hover:border-cyan-400/70',
    tint: 'bg-gradient-to-br from-cyan-500/[0.08] via-transparent to-transparent',
    glow: 'shadow-[0_0_18px_rgba(34,211,238,0.16),inset_0_1px_0_rgba(255,255,255,0.07)]',
    glowHover: 'hover:shadow-[0_0_28px_rgba(34,211,238,0.32),inset_0_1px_0_rgba(255,255,255,0.10)]',
    action: 'border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-400/60 hover:bg-cyan-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:border-cyan-400/40 dark:hover:bg-white/[0.12]',
  },
  {
    border: 'border-amber-400/40 hover:border-amber-400/70',
    tint: 'bg-gradient-to-br from-amber-500/[0.08] via-transparent to-transparent',
    glow: 'shadow-[0_0_18px_rgba(251,191,36,0.16),inset_0_1px_0_rgba(255,255,255,0.07)]',
    glowHover: 'hover:shadow-[0_0_28px_rgba(251,191,36,0.32),inset_0_1px_0_rgba(255,255,255,0.10)]',
    action: 'border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-400/60 hover:bg-amber-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:border-amber-400/40 dark:hover:bg-white/[0.12]',
  },
  {
    border: 'border-purple-400/40 hover:border-purple-400/70',
    tint: 'bg-gradient-to-br from-purple-500/[0.08] via-transparent to-transparent',
    glow: 'shadow-[0_0_18px_rgba(192,132,252,0.16),inset_0_1px_0_rgba(255,255,255,0.07)]',
    glowHover: 'hover:shadow-[0_0_28px_rgba(192,132,252,0.32),inset_0_1px_0_rgba(255,255,255,0.10)]',
    action: 'border-slate-200 bg-slate-50 text-slate-700 hover:border-purple-400/60 hover:bg-purple-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:border-purple-400/40 dark:hover:bg-white/[0.12]',
  },
  {
    border: 'border-sky-400/40 hover:border-sky-400/70',
    tint: 'bg-gradient-to-br from-sky-500/[0.08] via-transparent to-transparent',
    glow: 'shadow-[0_0_18px_rgba(56,189,248,0.16),inset_0_1px_0_rgba(255,255,255,0.07)]',
    glowHover: 'hover:shadow-[0_0_28px_rgba(56,189,248,0.32),inset_0_1px_0_rgba(255,255,255,0.10)]',
    action: 'border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-400/60 hover:bg-sky-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:border-sky-400/40 dark:hover:bg-white/[0.12]',
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
    <div className="relative min-h-screen overflow-hidden bg-canvas dark:bg-[#080b11]">
      {/* Ambient futuristic backdrop — scoped exclusively to this route */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black_30%,transparent_75%)]" />
        <div className="absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-rose-500/[0.08] blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-72 w-72 rounded-full bg-amber-500/[0.06] blur-3xl" />
      </div>
      <Navbar />
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">User Detail View</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Search the directory and open a member card to view their complete ledger history.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            <Users size={16} className="text-sky-600 dark:text-sky-400" />
            <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">{filtered.length}</span>
            <span>of {members.length}</span>
          </div>
        </div>

        <div className="relative mb-8 max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, J.No, village or admin..."
            autoFocus
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-100 dark:backdrop-blur-md dark:placeholder:text-slate-500 dark:focus:border-slate-600 dark:focus:ring-sky-500/20"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-300"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {loading ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 dark:backdrop-blur-md">Loading members...</p>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400">No members found.</p>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((m, index) => {
              const palette = cardPalettes[index % cardPalettes.length];
              return (
                <Link
                  key={m._id}
                  to={`/users/${m._id}`}
                  className={`group no-underline hover:no-underline flex h-full min-h-[190px] flex-col rounded-3xl border bg-surface p-4 backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-1 dark:bg-white/[0.03] ${palette.tint} ${palette.border} ${palette.glow} ${palette.glowHover}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-medium tracking-tight text-slate-900 dark:text-white" title={m.name}>
                      {m.name}
                    </p>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 backdrop-blur-sm dark:border-white/10 dark:bg-white/10 dark:text-slate-300">
                      {m.jNo || '—'}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1">
                    <p className="truncate text-sm text-slate-500 dark:text-slate-400" title={m.villageName || 'No village'}>
                      {m.villageName || 'No village'}
                    </p>
                    <p className="truncate text-sm text-slate-500 dark:text-slate-400" title={String(m.createdByWorker || '').trim() || 'Unassigned'}>
                      Admin: <span className="font-medium text-slate-800 dark:text-slate-200">{String(m.createdByWorker || '').trim() || 'Unassigned'}</span>
                    </p>
                  </div>
                  <span className={`mt-auto inline-flex items-center justify-center gap-1 rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-200 group-hover:scale-[1.02] ${palette.action}`}>
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
