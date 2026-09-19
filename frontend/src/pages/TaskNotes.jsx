import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Check, X, ClipboardList, Target, Wallet, CircleDashed, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import ConfirmModal from '../components/ConfirmModal';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const emptyRow = () => ({
  localId: `${Date.now()}-${Math.random()}`,
  description: '',
  note: '',
  presentAmount: '',
  targetAmount: '',
});

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const noteRemaining = (note) =>
  Number(note.remainingBalance ?? (Number(note.presentAmount || 0) - Number(note.totalAmount ?? note.targetAmount ?? 0)));

const NOTES_PER_PAGE = 5;

const TaskNotes = () => {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState([emptyRow()]);
  const [savedNotes, setSavedNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [editForm, setEditForm] = useState({ description: '', note: '', presentAmount: '', targetAmount: '' });
  const [noteToDelete, setNoteToDelete] = useState(null);
  const [search, setSearch] = useState('');
  const [openPage, setOpenPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);

  const fetchTaskNotes = async () => {
    if (!isAuthenticated) return;

    setLoading(true);
    try {
      const response = await api.get('/task-notes');
      const taskNotes = response.data.taskNotes || response.data || [];
      setSavedNotes(Array.isArray(taskNotes) ? taskNotes : []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load task notes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      setError('Please log in to view task notes.');
      return;
    }
    fetchTaskNotes();
  }, [authLoading, isAuthenticated]);

  const updateRow = (localId, name, value) => {
    setRows((current) => current.map((row) => (row.localId === localId ? { ...row, [name]: value } : row)));
  };

  const removeRow = (localId) => {
    setRows((current) => (current.length === 1 ? current : current.filter((row) => row.localId !== localId)));
  };

  const rowRemaining = (row) => {
    const present = Number(row.presentAmount || 0);
    const target = Number(row.targetAmount || 0);
    return (Number.isFinite(present) ? present : 0) - (Number.isFinite(target) ? target : 0);
  };

  const composerTotals = rows.reduce(
    (sum, row) => {
      sum.present += Number(row.presentAmount || 0);
      sum.target += Number(row.targetAmount || 0);
      sum.remaining += rowRemaining(row);
      return sum;
    },
    { present: 0, target: 0, remaining: 0 }
  );

  // Full board totals (all notes, regardless of status).
  const boardTotals = savedNotes.reduce(
    (sum, note) => {
      sum.present += Number(note.presentAmount || 0);
      sum.target += Number(note.totalAmount ?? note.targetAmount ?? 0);
      sum.remaining += noteRemaining(note);
      return sum;
    },
    { present: 0, target: 0, remaining: 0 }
  );

  // Amounts tied to completed tasks. These are deducted from the primary
  // "Present Total" summary card in real time (no page reload needed) and
  // shown on their own dedicated "Completed Tasks Total" card.
  const completedNotes = savedNotes.filter((note) => note.status === 'completed');
  const completedTotals = completedNotes.reduce(
    (sum, note) => {
      sum.present += Number(note.presentAmount || 0);
      sum.target += Number(note.totalAmount ?? note.targetAmount ?? 0);
      sum.remaining += noteRemaining(note);
      return sum;
    },
    { present: 0, target: 0, remaining: 0 }
  );

  // Primary card value = all tasks minus completed task amounts.
  const activePresentTotal = boardTotals.present - completedTotals.present;
  const activeRemainingTotal = boardTotals.remaining - completedTotals.remaining;

  const saveRows = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const invalidRow = rows.find((row) => !row.description.trim() || row.presentAmount === '' || Number(row.presentAmount) < 0);
    if (invalidRow) {
      setError('Each task requires a description and a valid present amount.');
      return;
    }

    setSaving(true);
    try {
      await Promise.all(
        rows.map((row) =>
          api.post('/task-notes', {
            description: row.description,
            note: row.note.trim() || null,
            presentAmount: Number(row.presentAmount),
            totalAmount: row.targetAmount === '' ? null : Number(row.targetAmount),
            targetAmount: row.targetAmount === '' ? null : Number(row.targetAmount),
          })
        )
      );
      setRows([emptyRow()]);
      setSuccess('Task notes saved successfully.');
      showToast('Task notes saved successfully.');
      await fetchTaskNotes();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to save task notes';
      setError(message);
      showToast(`Action failed: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!noteToDelete) return;
    try {
      await api.delete(`/task-notes/${noteToDelete._id}`);
      setSavedNotes((current) => current.filter((note) => note._id !== noteToDelete._id));
      setNoteToDelete(null);
      showToast('Task note deleted successfully.');
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to delete task note';
      setError(message);
      showToast(`Action failed: ${message}`, 'error');
      setNoteToDelete(null);
    }
  };

  const completeNote = async (note) => {
    try {
      const res = await api.put(`/task-notes/${note._id}`, { status: note.status === 'completed' ? 'open' : 'completed' });
      setSavedNotes((current) => current.map((item) => (item._id === note._id ? res.data.taskNote : item)));
      showToast(note.status === 'completed' ? 'Task reopened successfully.' : 'Task completed successfully.', 'info');
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to update task status';
      setError(message);
      showToast(`Action failed: ${message}`, 'error');
    }
  };

  const openEdit = (note) => {
    setEditingNote(note);
    setEditForm({
      description: note.description || '',
      note: note.note || '',
      presentAmount: note.presentAmount ?? '',
      targetAmount: note.totalAmount ?? note.targetAmount ?? '',
    });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editingNote) return;
    if (!editForm.description.trim() || editForm.presentAmount === '' || Number(editForm.presentAmount) < 0) {
      setError('Each task requires a description and a valid present amount.');
      return;
    }
    try {
      const res = await api.put(`/task-notes/${editingNote._id}`, {
        description: editForm.description,
        note: editForm.note.trim() || null,
        presentAmount: Number(editForm.presentAmount),
        totalAmount: editForm.targetAmount === '' ? null : Number(editForm.targetAmount),
        targetAmount: editForm.targetAmount === '' ? null : Number(editForm.targetAmount),
      });
      setSavedNotes((current) => current.map((item) => (item._id === editingNote._id ? res.data.taskNote : item)));
      setEditingNote(null);
      showToast('Task note updated successfully.');
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to update task note';
      setError(message);
      showToast(`Action failed: ${message}`, 'error');
    }
  };

  // Real-time search across description (title), and notes/amount text.
  const query = search.trim().toLowerCase();
  const matchesSearch = (note) => {
    if (!query) return true;
    const haystack = [
      note.description,
      note.note,
      String(note.presentAmount ?? ''),
      String(note.totalAmount ?? note.targetAmount ?? ''),
      String(note.remainingBalance ?? ''),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  };

  const openNotes = savedNotes.filter((note) => note.status !== 'completed' && matchesSearch(note));
  const completedNotesFiltered = completedNotes.filter(matchesSearch);
  const openPageCount = Math.max(1, Math.ceil(openNotes.length / NOTES_PER_PAGE));
  const completedPageCount = Math.max(1, Math.ceil(completedNotesFiltered.length / NOTES_PER_PAGE));
  const visibleOpenNotes = openNotes.slice((openPage - 1) * NOTES_PER_PAGE, openPage * NOTES_PER_PAGE);
  const visibleCompletedNotes = completedNotesFiltered.slice(
    (completedPage - 1) * NOTES_PER_PAGE,
    completedPage * NOTES_PER_PAGE
  );

  useEffect(() => {
    setOpenPage(1);
    setCompletedPage(1);
  }, [search]);

  useEffect(() => {
    setOpenPage((page) => Math.min(page, openPageCount));
  }, [openPageCount]);

  useEffect(() => {
    setCompletedPage((page) => Math.min(page, completedPageCount));
  }, [completedPageCount]);

  const StatWidget = ({ icon: Icon, label, value, tint, iconTint }) => (
    <div className={`group rounded-2xl border border-white/70 bg-gradient-to-br p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${tint}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-white/80 ${iconTint}`}>
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1 whitespace-nowrap font-mono text-xl font-semibold tabular-nums text-slate-900">{formatMoney(value)}</p>
        </div>
      </div>
    </div>
  );

  const NoteCard = ({ note }) => {
    const isComplete = note.status === 'completed';
    return (
      <article className="flex h-full min-h-[300px] min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_8px_20px_-4px_rgba(0,0,0,0.08)] transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-2 min-h-[3rem] font-semibold leading-6 text-slate-900" title={note.description}>
              {note.description}
            </p>
            {note.note?.trim() && (
              <p className="mt-2 line-clamp-3 text-sm italic leading-5 text-slate-600" title={note.note}>
                {note.note}
              </p>
            )}
            <p className="mt-1 text-[11px] text-slate-400">
              {new Date(note.updatedAt || note.createdAt).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
              isComplete
                ? 'bg-emerald-100 text-emerald-800 ring-emerald-600/20'
                : 'bg-amber-100 text-amber-800 ring-amber-600/20'
            }`}
          >
            {isComplete ? 'Completed' : 'Open'}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Present</p>
            <p className="mt-1 whitespace-nowrap font-mono text-sm font-semibold leading-5 tabular-nums text-slate-900">{formatMoney(note.presentAmount)}</p>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Target</p>
            <p className="mt-1 whitespace-nowrap font-mono text-sm font-semibold leading-5 tabular-nums text-slate-900">
              {(note.totalAmount ?? note.targetAmount) === null || (note.totalAmount ?? note.targetAmount) === undefined
                ? '—'
                : formatMoney(note.totalAmount ?? note.targetAmount)}
            </p>
          </div>
          <div className="col-span-2 min-w-0 rounded-xl border border-brand-100 bg-brand-50/80 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700/80">Have</p>
            <p className="mt-1 whitespace-nowrap font-mono text-sm font-semibold leading-5 tabular-nums text-brand-700">{formatMoney(noteRemaining(note))}</p>
          </div>
        </div>
        <div className="mt-auto grid grid-cols-1 gap-2 pt-5 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => openEdit(note)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200/80 bg-blue-50 px-2.5 py-2 text-xs font-semibold text-blue-700 transition-all hover:-translate-y-0.5 hover:bg-blue-100 hover:shadow-sm"
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            type="button"
            onClick={() => completeNote(note)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-700 transition-all hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-sm"
          >
            <Check size={13} /> {isComplete ? 'Reopen' : 'Complete'}
          </button>
          <button
            type="button"
            onClick={() => setNoteToDelete(note)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200/80 bg-white px-2.5 py-2 text-xs font-semibold text-red-600 transition-all hover:-translate-y-0.5 hover:bg-red-50 hover:shadow-sm"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </article>
    );
  };

  const NotePagination = ({ page, pageCount, total, onPageChange }) => {
    if (pageCount <= 1) return null;

    const firstItem = (page - 1) * NOTES_PER_PAGE + 1;
    const lastItem = Math.min(page * NOTES_PER_PAGE, total);

    return (
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4 text-xs text-slate-500">
        <span>
          Showing {firstItem}-{lastItem} of {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5 font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <span className="min-w-16 text-center font-medium text-slate-700">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page === pageCount}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5 font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.08),_transparent_32%),#f8fafc]">
      <Navbar />
      <main className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Workspace</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Task Notes</h1>
            <p className="mt-1 text-sm text-slate-500">Track present amounts, targets, and remaining balances in one focused workspace.</p>
          </div>
          <div className="hidden rounded-full border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm sm:block">
            {savedNotes.length} total {savedNotes.length === 1 ? 'task' : 'tasks'}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatWidget icon={Wallet} label="Present Total" value={activePresentTotal} tint="from-indigo-50 via-white to-blue-50" iconTint="bg-indigo-100 text-indigo-700" />
          <StatWidget icon={Target} label="Target Total" value={boardTotals.target} tint="from-amber-50 via-white to-orange-50" iconTint="bg-amber-100 text-amber-700" />
          <StatWidget icon={ClipboardList} label="Remaining Balance" value={activeRemainingTotal} tint="from-emerald-50 via-white to-teal-50" iconTint="bg-emerald-100 text-emerald-700" />
          <StatWidget icon={Check} label="Completed Tasks Total" value={completedTotals.present} tint="from-sky-50 via-white to-cyan-50" iconTint="bg-sky-100 text-sky-700" />
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {success && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}

        <form onSubmit={saveRows} className="mb-8 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-sm">
          <div className="border-b border-slate-100/80 bg-white/70 px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Add task notes</h2>
                <p className="mt-1 text-xs text-slate-500">Create one or more tasks. Have auto-calculates as Present minus Target.</p>
              </div>
              <span className="hidden rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 sm:inline-flex">Quick entry</span>
            </div>
          </div>
          <div className="space-y-3 bg-slate-50/40 p-4 sm:p-6">
            {rows.map((row) => (
              <div key={row.localId} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm lg:grid-cols-[minmax(0,1.4fr)_160px_160px_160px_44px]">
                <div className="space-y-2">
                  <input
                    value={row.description}
                    onChange={(event) => updateRow(row.localId, 'description', event.target.value)}
                    placeholder="Task description"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <textarea
                    value={row.note}
                    onChange={(event) => updateRow(row.localId, 'note', event.target.value)}
                    placeholder="Add extra notes or instructions here (optional)..."
                    rows={2}
                    maxLength={2000}
                    className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={row.presentAmount}
                  onChange={(event) => updateRow(row.localId, 'presentAmount', event.target.value)}
                  placeholder="Present amount"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-right font-mono text-sm tabular-nums placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.targetAmount}
                  onChange={(event) => updateRow(row.localId, 'targetAmount', event.target.value)}
                  placeholder="Target amount"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-right font-mono text-sm tabular-nums placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">Have</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-brand-700">{formatMoney(rowRemaining(row))}</span>
                </div>
                <button type="button" onClick={() => removeRow(row.localId)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Delete row">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-200/80 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <button
              type="button"
              onClick={() => setRows((current) => [...current, emptyRow()])}
              className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
            >
              <Plus size={16} /> Add New Task Row
            </button>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <span>Present: <strong className="font-mono tabular-nums">{formatMoney(composerTotals.present)}</strong></span>
              <span>Target: <strong className="font-mono tabular-nums">{formatMoney(composerTotals.target)}</strong></span>
              <span>Have: <strong className="font-mono tabular-nums text-brand-700">{formatMoney(composerTotals.remaining)}</strong></span>
            </div>
            <button type="submit" disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Task Notes'}
            </button>
          </div>
        </form>

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Saved Task Notes</h2>
              <p className="mt-0.5 text-xs text-slate-500">Review, update, and complete your saved work.</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks by title, description or amount..."
                aria-label="Search task notes"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm text-slate-700 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          {loading ? (
            <p className="rounded-xl border border-slate-200/80 bg-white/80 p-5 text-sm text-slate-500 shadow-sm">Loading task notes...</p>
          ) : savedNotes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-500 shadow-sm">No task notes saved yet.</p>
          ) : openNotes.length === 0 && completedNotesFiltered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-500 shadow-sm">
              No tasks match your search.
            </p>
          ) : (
            <div className="space-y-8">
              <div className="rounded-2xl border border-amber-200/60 bg-amber-50/40 p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <CircleDashed size={16} className="text-amber-600" /> Open ({openNotes.length})
                  </div>
                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">Active</span>
                </div>
                {openNotes.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-amber-200 bg-white/60 p-4 text-sm text-slate-500">No open tasks.</p>
                ) : (
                  <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-6">
                    {visibleOpenNotes.map((note) => (
                      <NoteCard key={note._id} note={note} />
                    ))}
                  </div>
                )}
                <NotePagination page={openPage} pageCount={openPageCount} total={openNotes.length} onPageChange={setOpenPage} />
              </div>

              <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/50 p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Check size={16} className="text-emerald-600" /> Completed ({completedNotesFiltered.length})
                  </div>
                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">Archived</span>
                </div>
                {completedNotesFiltered.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-emerald-200/80 bg-white/70 p-4 text-sm text-slate-500">No completed tasks yet. Completed work will appear here.</p>
                ) : (
                  <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-6">
                    {visibleCompletedNotes.map((note) => (
                      <NoteCard key={note._id} note={note} />
                    ))}
                  </div>
                )}
                <NotePagination
                  page={completedPage}
                  pageCount={completedPageCount}
                  total={completedNotesFiltered.length}
                  onPageChange={setCompletedPage}
                />
              </div>
            </div>
          )}
        </section>
      </main>

      {editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveEdit} className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Edit Task Note</h3>
              <button type="button" onClick={() => setEditingNote(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Task description"
              />
              <textarea
                value={editForm.note}
                onChange={(e) => setEditForm((prev) => ({ ...prev, note: e.target.value }))}
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Add extra notes or instructions here (optional)..."
                rows={3}
                maxLength={2000}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.presentAmount}
                onChange={(e) => setEditForm((prev) => ({ ...prev, presentAmount: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Present amount"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.targetAmount}
                onChange={(e) => setEditForm((prev) => ({ ...prev, targetAmount: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Target amount"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingNote(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={!!noteToDelete}
        title="Delete Task Note"
        message={`Are you sure you want to delete "${noteToDelete?.description}"?`}
        onConfirm={confirmDelete}
        onCancel={() => setNoteToDelete(null)}
      />
    </div>
  );
};

export default TaskNotes;
