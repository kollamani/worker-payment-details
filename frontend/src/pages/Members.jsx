import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, X, Users, MapPin, ShieldCheck, ChevronRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import MemberForm from '../components/MemberForm';
import ConfirmModal from '../components/ConfirmModal';
import api from '../api/axios';

const tintMap = {
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
};

const StatTile = ({ icon: Icon, label, value, tint = 'indigo' }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-3">
      <span className={`shrink-0 rounded-lg p-2.5 ${tintMap[tint]}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <p className="font-mono text-xl font-bold tabular-nums text-slate-900">{value}</p>
      </div>
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
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Manage Workers</h1>
            <p className="mt-1 text-sm text-slate-500">Add, edit, or remove workers from the ledger</p>
          </div>
          <button
            onClick={openAddForm}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <Plus size={16} /> Add Worker
          </button>
        </div>

        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile icon={Users} label="Total Members" value={totalMembers} tint="indigo" />
            <StatTile icon={MapPin} label="Active Villages" value={activeVillages} tint="emerald" />
            <StatTile icon={ShieldCheck} label="Unassigned Admins" value={unassignedAdmins} tint="amber" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by worker, admin, J.No or village..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of {totalMembers} member(s)
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3.5 text-left font-semibold">S.No</th>
                <th className="px-4 py-3.5 text-left font-semibold">J.No</th>
                <th className="px-4 py-3.5 text-left font-semibold">Worker Name</th>
                <th className="px-4 py-3.5 text-left font-semibold">Village</th>
                <th className="px-4 py-3.5 text-left font-semibold">Admin</th>
                <th className="px-4 py-3.5 text-left font-semibold">Phone</th>
                <th className="px-4 py-3.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    Loading members...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    No members found.
                  </td>
                </tr>
              ) : (
                filtered.map((m, idx) => (
                  <tr key={m._id} className="table-row-hover">
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600">
                        {m.jNo}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/users/${m._id}`}
                        className="worker-nav-link font-medium"
                      >
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{m.villageName || '—'}</td>
                    <td className="px-4 py-3">
                      {String(m.createdByWorker || '').trim() ? (
                        <span className="text-slate-600">{m.createdByWorker}</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-inset ring-amber-600/20">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-500">{m.phone || '—'}</td>
                    
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditForm(m)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                          title="Edit member"
                        >
                          <Pencil size={14} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDelete(m)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                          title="Delete member"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile / tablet card list */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
          {loading ? (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              Loading members...
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              No members found.
            </p>
          ) : (
            filtered.map((m) => (
              <div
                key={m._id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{m.name}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{m.villageName || 'No village'}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600">
                    {m.jNo}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <p>
                    Admin:{' '}
                    <span className="font-medium text-slate-700">
                      {String(m.createdByWorker || '').trim() || 'Unassigned'}
                    </span>
                  </p>
                  <p>
                    Phone: <span className="font-mono tabular-nums text-slate-700">{m.phone || '—'}</span>
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Link
                    to={`/users/${m._id}`}
                    className="worker-nav-link inline-flex items-center gap-1 text-xs font-semibold text-brand-700"
                  >
                    View ledger <ChevronRight size={14} />
                  </Link>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(m)}
                      className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-blue-700 transition-colors hover:bg-blue-100"
                      title="Edit member"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(m)}
                      className="rounded-lg border border-red-200 bg-white p-2 text-red-600 transition-colors hover:bg-red-50"
                      title="Delete member"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
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
  );
};

export default Members;
