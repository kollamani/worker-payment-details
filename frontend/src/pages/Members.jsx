import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, X, Users, MapPin, ShieldCheck, ChevronRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import MemberForm from '../components/MemberForm';
import ConfirmModal from '../components/ConfirmModal';
import api from '../api/axios';

// Neon accent palettes cycled across the card grid (order matches the design spec:
// rose -> teal -> amber -> purple -> sky). Every class is a full literal string so
// Tailwind's JIT compiler can statically detect and generate each utility.
// Each card gets: translucent neon border + outer glow + inner bevel highlight,
// with a stronger outer glow on hover for 3D depth.
const cardGlow = [
  {
    border: 'border-pink-500/40 hover:border-pink-400/70',
    glow: 'shadow-[0_0_15px_rgba(244,63,94,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
    hoverGlow: 'hover:shadow-[0_0_28px_rgba(244,63,94,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]',
  },
  {
    border: 'border-teal-400/40 hover:border-teal-300/70',
    glow: 'shadow-[0_0_15px_rgba(45,212,191,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
    hoverGlow: 'hover:shadow-[0_0_28px_rgba(45,212,191,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]',
  },
  {
    border: 'border-amber-400/40 hover:border-amber-300/70',
    glow: 'shadow-[0_0_15px_rgba(251,191,36,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
    hoverGlow: 'hover:shadow-[0_0_28px_rgba(251,191,36,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]',
  },
  {
    border: 'border-purple-400/40 hover:border-purple-300/70',
    glow: 'shadow-[0_0_15px_rgba(192,132,252,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
    hoverGlow: 'hover:shadow-[0_0_28px_rgba(192,132,252,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]',
  },
  {
    border: 'border-sky-400/40 hover:border-sky-300/70',
    glow: 'shadow-[0_0_15px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
    hoverGlow: 'hover:shadow-[0_0_28px_rgba(56,189,248,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]',
  },
];

const statTint = {
  indigo: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
};

const StatTile = ({ icon: Icon, label, value, tint = 'indigo' }) => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
    <span className={`shrink-0 rounded-lg p-2.5 ${statTint[tint]}`}>
      <Icon size={18} />
    </span>
    <div className="min-w-0">
      <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-gray-400">{label}</p>
      <p className="font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
    </div>
  </div>
);

const Members = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);

  const fetchMembers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/members');
      setMembers(res.data.members);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const openAddForm = () => {
    setEditingMember(null);
    setFormOpen(true);
  };

  const openEditForm = (member) => {
    setEditingMember(member);
    setFormOpen(true);
  };

  const handleFormSubmit = async (data) => {
    if (editingMember) {
      await api.put(`/members/${editingMember._id}`, data);
    } else {
      await api.post('/members', data);
    }
    setFormOpen(false);
    fetchMembers();
  };

  const requestDelete = (member) => {
    setMemberToDelete(member);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/members/${memberToDelete._id}`);
      setConfirmOpen(false);
      setMemberToDelete(null);
      fetchMembers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete member');
      setConfirmOpen(false);
    }
  };

  // Search filter: matches Worker Name, J.No, Village, or Admin (case-insensitive).
  const filtered = members.filter((m) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const workerName = String(m.workerName ?? m.name ?? '');
    const admin = String(m.admin ?? m.createdByWorker ?? '');
    return (
      workerName.toLowerCase().includes(query) ||
      admin.toLowerCase().includes(query) ||
      String(m.jNo || '').toLowerCase().includes(query) ||
      String(m.villageName || '').toLowerCase().includes(query)
    );
  });

  const totalMembers = members.length;
  const activeVillages = new Set(
    members.map((m) => String(m.villageName || '').trim()).filter(Boolean)
  ).size;
  const unassignedAdmins = members.filter(
    (m) => !String(m.admin ?? m.createdByWorker ?? '').trim()
  ).length;

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas text-slate-800 dark:bg-[#0B0F17] dark:text-slate-100">
      {/* Ambient atmosphere: masked grid mesh + soft neon glow orbs (scoped to this page). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_75%_60%_at_50%_0%,black,transparent)]" />
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-pink-500/10 blur-3xl" />
        <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute bottom-10 right-1/3 h-80 w-80 rounded-full bg-teal-500/10 blur-3xl" />
      </div>

      <div className="relative z-10">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Header: title + subtext on the left, count badge + Add Worker on the right. */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-white">Manage Workers</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-gray-400">Add, edit, or remove workers from the ledger</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                <Users size={16} className="text-sky-600 dark:text-sky-400" />
                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">{filtered.length}</span>
                <span>of {totalMembers}</span>
              </span>
              <button
                onClick={openAddForm}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 shadow-sm transition-all duration-300 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200 dark:shadow-[0_0_15px_rgba(56,189,248,0.15)] dark:hover:bg-sky-500/20 dark:hover:shadow-[0_0_25px_rgba(56,189,248,0.30)]"
              >
                <Plus size={16} /> Add Worker
              </button>
            </div>
          </div>

          {/* Stat tiles + search input. */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:backdrop-blur-md">
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile icon={Users} label="Total Members" value={totalMembers} tint="indigo" />
              <StatTile icon={MapPin} label="Active Villages" value={activeVillages} tint="emerald" />
              <StatTile icon={ShieldCheck} label="Unassigned Admins" value={unassignedAdmins} tint="amber" />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by worker, admin, J.No or village..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-500"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-200"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Showing <span className="font-semibold text-slate-900 dark:text-white">{filtered.length}</span> of {totalMembers} member(s)
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          )}

          {loading ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400">
              Loading members...
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-white/15 dark:bg-white/[0.02] dark:text-gray-400">
              No members found.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((m, index) => {
                const palette = cardGlow[index % cardGlow.length];
                const admin = String(m.createdByWorker || '').trim();
                return (
                  <div
                    key={m._id}
                    className={`group flex h-full min-h-[190px] flex-col rounded-2xl border bg-white p-4 backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] dark:bg-slate-900/40 ${palette.border} ${palette.glow} ${palette.hoverGlow}`}
                  >
                    {/* Top row: member name + J.No pill badge. */}
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        to={`/users/${m._id}`}
                        className="min-w-0 truncate text-sm font-semibold text-slate-900 transition-colors hover:text-sky-600 dark:text-white dark:hover:text-sky-300"
                        title={m.name}
                      >
                        {m.name}
                      </Link>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-white/10 dark:text-gray-300">
                        {m.jNo || '—'}
                      </span>
                    </div>

                    {/* Middle details: village, admin, phone. */}
                    <div className="mt-3 space-y-1.5">
                      <p className="flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-gray-400" title={m.villageName || 'No village'}>
                        <MapPin size={12} className="shrink-0 text-slate-400 dark:text-gray-500" />
                        {m.villageName || 'No village'}
                      </p>
                      <p className="truncate text-xs font-medium text-slate-600 dark:text-gray-300" title={admin || 'Unassigned'}>
                        <ShieldCheck size={12} className="mr-1 inline shrink-0 text-slate-400 dark:text-gray-500" />
                        Admin: <span className="font-semibold text-slate-900 dark:text-gray-100">{admin || 'Unassigned'}</span>
                      </p>
                      <p className="truncate font-mono text-xs tabular-nums text-slate-500 dark:text-gray-400">{m.phone || '—'}</p>
                    </div>

                    {/* Bottom action row: frosted glass buttons pinned to card bottom. */}
                    <div className="mt-auto flex items-center gap-2 pt-4">
                      <Link
                        to={`/users/${m._id}`}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                      >
                        Open ledger
                        <ChevronRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => openEditForm(m)}
                        title="Edit member"
                        aria-label={`Edit ${m.name}`}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDelete(m)}
                        title="Delete member"
                        aria-label={`Delete ${m.name}`}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-rose-500/15 dark:hover:text-rose-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        <MemberForm
          open={formOpen}
          initialData={editingMember}
          onSubmit={handleFormSubmit}
          onClose={() => setFormOpen(false)}
        />

        <ConfirmModal
          open={confirmOpen}
          title="Delete Member"
          message={`Are you sure you want to delete "${memberToDelete?.name}"? This will also permanently delete all their transaction history.`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      </div>
    </div>
  );
};

export default Members;
