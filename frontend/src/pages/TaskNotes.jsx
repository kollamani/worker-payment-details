import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Check, X, Wallet, Receipt, TrendingUp, TrendingDown, Search, ChevronDown } from 'lucide-react';
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
  category: DEFAULT_CATEGORY,
});

// Task categories — values must match the backend TaskNote schema enum.
export const CATEGORIES = [
  { value: 'PRESENT_HAVING', label: 'Present Having' },
  { value: 'PRESENT_EXPENSE', label: 'Present Expense' },
  { value: 'EXPECTED_INCOME', label: 'Expected Income' },
  { value: 'EXPECTED_EXPENSE', label: 'Expected Expense' },
];

export const DEFAULT_CATEGORY = 'PRESENT_HAVING';



// Normalizes any incoming category value (enum key, legacy label text, or a
// casing variant) into a standardized enum key so the badge label/color
// lookups can never silently fall back to "Present Having".
const normalizeCategory = (categoryValue) => {
  if (!categoryValue) return DEFAULT_CATEGORY;
  const raw = String(categoryValue).trim();
  if (!raw) return DEFAULT_CATEGORY;
  // 'SAVINGS' was removed and replaced by 'PRESENT_EXPENSE'; remap legacy
  // documents/labels so old tasks render in their new bucket.
  const upper = raw.toUpperCase();
  const normalized = upper === 'SAVINGS' ? 'PRESENT_EXPENSE' : raw;
  const direct = CATEGORIES.find((category) => category.value === normalized.toUpperCase());
  if (direct) return direct.value;
  const byLabel = CATEGORIES.find((category) => category.label.toLowerCase() === raw.toLowerCase());
  return byLabel ? byLabel.value : normalized.toUpperCase();
};

// Single source of truth for a category's display label + badge colors.
// Used by the saved task cards, the KPI bar, and the category filter tabs.
const getCategoryDetails = (categoryValue) => {
  switch (normalizeCategory(categoryValue)) {
    case 'EXPECTED_EXPENSE':
      return { value: 'EXPECTED_EXPENSE', label: 'Expected Expense', colorClass: 'bg-red-100 text-red-700 border-red-300' };
    case 'EXPECTED_INCOME':
      return { value: 'EXPECTED_INCOME', label: 'Expected Income', colorClass: 'bg-green-100 text-green-700 border-green-300' };
    case 'PRESENT_EXPENSE':
      return { value: 'PRESENT_EXPENSE', label: 'Present Expense', colorClass: 'bg-rose-100 text-rose-700 border-rose-300' };
    case 'PRESENT_HAVING':
    default:
      return { value: 'PRESENT_HAVING', label: 'Present Having', colorClass: 'bg-blue-100 text-blue-700 border-blue-300' };
  }
};

const categoryLabel = (value) => getCategoryDetails(value).label;
const categoryShortLabel = (value) => getCategoryDetails(value).label;
const categoryBadgeClass = (value) => getCategoryDetails(value).colorClass;

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------
// Business metric model (mirrors the backend buildTaskSummary())
// ---------------------------------------------------------------------------
// Categories whose amounts represent money currently held ("Present Income").
// PRESENT_EXPENSE (the replacement for the removed 'SAVINGS') is the expense
// bucket — its tasks reduce the balance when completed, never add income.
const INCOME_CATEGORIES = ['PRESENT_HAVING'];
// Categories whose amounts represent money going out.
const EXPENSE_CATEGORIES = ['PRESENT_EXPENSE', 'EXPECTED_EXPENSE'];

// Display groups — every category renders as its own section with its own
// tasks and its own total. "Present Expense" is the COMPLETED bucket: any
// completed expense task is treated as Present Expense.
const GROUPS = [
  { key: 'PRESENT_HAVING', label: 'Present Having', hint: 'Available balance' },
  { key: 'PRESENT_EXPENSE', label: 'Present Expense', hint: 'Completed & filed expenses' },
  { key: 'EXPECTED_INCOME', label: 'Expected Income', hint: 'Pending income' },
  { key: 'EXPECTED_EXPENSE', label: 'Expected Expense', hint: 'Pending expenses' },
];

const amountOf = (note) => Number(note.presentAmount || 0);
const isCompleted = (note) => note.status === 'completed';

// Section a task is displayed under. Completed expense tasks move into the
// Present Expense group; every other task stays in its own category.
const displayGroupKey = (note) => {
  const category = normalizeCategory(note.category);
  if (isCompleted(note) && EXPENSE_CATEGORIES.includes(category)) return 'PRESENT_EXPENSE';
  return category;
};

// Local mirror of the backend summary, used when the API response has no
// `summary` payload (older deployments).
const computeSummary = (notes) => {
  const presentIncome = notes
    .filter((note) => INCOME_CATEGORIES.includes(normalizeCategory(note.category)))
    .reduce((sum, note) => sum + amountOf(note), 0);
  const completed = notes.filter(isCompleted);
  const totalExpense = completed.reduce((sum, note) => sum + amountOf(note), 0);
  const pendingOf = (category) =>
    notes
      .filter((note) => !isCompleted(note) && normalizeCategory(note.category) === category)
      .reduce((sum, note) => sum + amountOf(note), 0);
  return {
    totalPresentHaving: presentIncome - totalExpense,
    presentIncome,
    totalExpense,
    totalExpectedIncome: pendingOf('EXPECTED_INCOME'),
    totalExpectedExpense: pendingOf('EXPECTED_EXPENSE'),
    counts: { total: notes.length, completed: completed.length, open: notes.length - completed.length },
  };
};

// The four dashboard metric cards required by the business spec.
const SUMMARY_CARDS = [
  { key: 'totalPresentHaving', label: 'Total Present Having', icon: Wallet, tint: 'from-emerald-50 via-white to-teal-50', iconTint: 'bg-emerald-100 text-emerald-700' },
  { key: 'totalExpense', label: 'Total Expense', icon: Receipt, tint: 'from-rose-50 via-white to-pink-50', iconTint: 'bg-rose-100 text-rose-700' },
  { key: 'totalExpectedIncome', label: 'Total Expected Income', icon: TrendingUp, tint: 'from-sky-50 via-white to-cyan-50', iconTint: 'bg-sky-100 text-sky-700' },
  { key: 'totalExpectedExpense', label: 'Total Expected Expense', icon: TrendingDown, tint: 'from-amber-50 via-white to-orange-50', iconTint: 'bg-amber-100 text-amber-700' },
];

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
  const [editForm, setEditForm] = useState({ description: '', note: '', presentAmount: '', category: DEFAULT_CATEGORY });
  const [noteToDelete, setNoteToDelete] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  // Summary metrics returned by the API (local recompute is the fallback).
  const [apiSummary, setApiSummary] = useState(null);

  const fetchTaskNotes = async () => {
    if (!isAuthenticated) return;

    setLoading(true);
    try {
      const response = await api.get('/task-notes');
      const rawNotes = response.data.taskNotes || response.data || [];
      const taskNotes = Array.isArray(rawNotes)
        ? rawNotes.map((note) => ({
            ...note,
            category: normalizeCategory(note.category),
          }))
        : [];
      setSavedNotes(taskNotes);
      setApiSummary(response.data?.summary || null);
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

  // Index-based row updater: always writes through a functional state update so
  // concurrent edits to different rows (or rapid dropdown changes) can never
  // hit a stale `rows` closure — the root cause of dropdown selections being
  // lost and tasks silently saving under the default category.
  const updateTaskRow = (index, name, value) => {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [name]: value } : row)));
  };

  // Dedicated category handler: updates ONLY that row's `category`
  // property through a functional state update. Nothing here can reset another
  // row, and the value is stored exactly as it arrives from the <select>.
  const handleCategoryChange = (index, newCategory) => {
    setRows((prevRows) => {
      const next = [...prevRows];
      next[index] = { ...next[index], category: newCategory };
      return next;
    });
  };

  const handleEditCategoryChange = (newCategory) => {
    setEditForm((prev) => ({ ...prev, category: newCategory }));
  };

  const removeTaskRow = (index) => {
    setRows((current) => (current.length === 1 ? current : current.filter((_, rowIndex) => rowIndex !== index)));
  };

  const composerTotal = rows.reduce((sum, row) => sum + Number(row.presentAmount || 0), 0);

  // Prefer the API-computed summary; fall back to the local mirror.
  const summary = apiSummary || computeSummary(savedNotes);

  // Task counts per display group (section headers + filter tabs).
  const groupCounts = GROUPS.reduce((acc, group) => {
    acc[group.key] = savedNotes.filter((note) => displayGroupKey(note) === group.key).length;
    return acc;
  }, {});



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
            // Map the selected dropdown value explicitly into the request body
            // so the chosen category (e.g. EXPECTED_INCOME) persists exactly.
            category: normalizeCategory(row.category),
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
      category: normalizeCategory(note.category),
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
        category: editForm.category,
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
      categoryLabel(note.category),
      String(note.presentAmount ?? ''),
      isCompleted(note) ? 'completed' : 'pending',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  };

  // Filter tabs operate on the display groups.
  const matchesCategory = (note) => categoryFilter === 'ALL' || displayGroupKey(note) === categoryFilter;

  // Every group carries its own filtered tasks and its own running total.
  const visibleGroups = GROUPS
    .filter((group) => categoryFilter === 'ALL' || group.key === categoryFilter)
    .map((group) => {
      const items = savedNotes.filter((note) => displayGroupKey(note) === group.key && matchesSearch(note));
      return { ...group, items, total: items.reduce((sum, note) => sum + amountOf(note), 0) };
    });

  const visibleTaskCount = visibleGroups.reduce((count, group) => count + group.items.length, 0);

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
    const groupKey = displayGroupKey(note);
    // Per-card category lookup: drives BOTH the badge label and its color, so
    // the card always reflects the category persisted for that note.
    const categoryDetails = getCategoryDetails(note.category);
    return (
      <article className="flex aspect-square min-h-[200px] min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white/95 p-3.5 shadow-[0_8px_20px_-4px_rgba(0,0,0,0.08)] transition-all duration-200 hover:-translate-y-1 hover:shadow-xl sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 min-h-[2.5rem] flex-1 text-sm font-semibold leading-5 text-slate-900" title={note.description}>
            {note.description}
          </p>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-4 ${categoryDetails.colorClass}`}
              title={categoryDetails.label}
            >
              {categoryDetails.label}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4 ring-1 ring-inset ${
                isComplete
                  ? 'bg-emerald-100 text-emerald-800 ring-emerald-600/20'
                  : 'bg-amber-100 text-amber-800 ring-amber-600/20'
              }`}
            >
              {isComplete ? 'Completed' : 'Open'}
            </span>
          </div>
        </div>

        {/* Optional note + compact date — one tight line to preserve card density */}
        <div className="mt-1.5 flex min-h-0 items-center gap-2 text-[11px] leading-4">
          {note.note?.trim() ? (
            <span className="truncate italic text-slate-500" title={note.note}>
              {note.note}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 whitespace-nowrap text-slate-400">
            {new Date(note.updatedAt || note.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          </span>
        </div>
        {/* Amount block */}
        <div className="mt-2 min-w-0 rounded-lg bg-slate-50 px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            {isCompleted(note) ? 'Expense (completed)' : 'Amount'}
          </p>
          <p className="truncate font-mono text-base font-semibold leading-6 tabular-nums text-slate-900">{formatMoney(amountOf(note))}</p>
        </div>

        {/* Compact footer actions pinned to the bottom edge */}
        <div className="mt-auto grid grid-cols-3 gap-1.5 pt-2.5">
          <button
            type="button"
            onClick={() => openEdit(note)}
            title="Edit task"
            aria-label="Edit task"
            className="inline-flex items-center justify-center rounded-full bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-700 transition-all hover:bg-blue-100"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={() => completeNote(note)}
            title={isComplete ? 'Reopen task' : 'Mark task complete'}
            aria-label={isComplete ? 'Reopen task' : 'Mark task complete'}
            className="inline-flex items-center justify-center rounded-full bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-700 transition-all hover:bg-emerald-100"
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            onClick={() => setNoteToDelete(note)}
            title="Delete task"
            aria-label="Delete task"
            className="inline-flex items-center justify-center rounded-full bg-white px-2 py-1.5 text-[11px] font-semibold text-red-600 ring-1 ring-inset ring-red-200/70 transition-all hover:bg-red-50"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </article>
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
            <p className="mt-1 text-sm text-slate-500">Track income, expenses, and expected totals in one focused workspace.</p>
          </div>
          <div className="hidden rounded-full border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm sm:block">
            {savedNotes.length} total {savedNotes.length === 1 ? 'task' : 'tasks'}
          </div>
        </div>

        {/* Dashboard metric cards — the four business totals. */}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SUMMARY_CARDS.map((card) => (
            <StatWidget
              key={card.key}
              icon={card.icon}
              label={card.label}
              value={summary[card.key] ?? 0}
              tint={card.tint}
              iconTint={card.iconTint}
            />
          ))}
        </div>

        {/* Live task counts. */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-inset ring-slate-200">
            Tasks <strong className="ml-1 font-mono tabular-nums text-slate-800">{summary.counts?.total ?? savedNotes.length}</strong>
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-inset ring-slate-200">
            Pending <strong className="ml-1 font-mono tabular-nums text-slate-800">{summary.counts?.open ?? 0}</strong>
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-inset ring-slate-200">
            Completed <strong className="ml-1 font-mono tabular-nums text-slate-800">{summary.counts?.completed ?? 0}</strong>
          </span>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {success && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}

        <form onSubmit={saveRows} className="mb-8 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-sm">
          <div className="border-b border-slate-100/80 bg-white/70 px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Add task notes</h2>
                <p className="mt-1 text-xs text-slate-500">Create one or more tasks. Pick a category and enter the amount.</p>
              </div>
              <span className="hidden rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 sm:inline-flex">Quick entry</span>
            </div>
          </div>
          <div className="space-y-3 bg-slate-50/40 p-4 sm:p-6">
            {rows.map((row, index) => (
              <div key={row.localId} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Task description</span>
                      <input
                        value={row.description}
                        onChange={(event) => updateTaskRow(index, 'description', event.target.value)}
                        placeholder="Task description"
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Note (optional)</span>
                      <textarea
                        value={row.note}
                        onChange={(event) => updateTaskRow(index, 'note', event.target.value)}
                        placeholder="Add extra notes or instructions here (optional)..."
                        rows={2}
                        maxLength={2000}
                        className="w-full resize-y rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </label>
                  </div>

                  {/* Category + amounts + live Have */}
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Category</span>
                      <div className="relative">
                        <select
                          value={row.category || DEFAULT_CATEGORY}
                          onChange={(e) => handleCategoryChange(index, e.target.value)}
                          aria-label="Task category"
                          title="Task category"
                          className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          {CATEGORIES.map((category) => (
                            <option key={category.value} value={category.value}>
                              {category.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      </div>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Amount (₹)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={row.presentAmount}
                        onChange={(event) => updateTaskRow(index, 'presentAmount', event.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900 shadow-sm placeholder:font-sans placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </label>
                  </div>
                </div>
                {rows.length > 1 && (
                  <div className="mt-3 flex justify-end border-t border-slate-200/80 pt-2">
                    <button
                      type="button"
                      onClick={() => removeTaskRow(index)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      title="Remove this task row"
                    >
                      <Trash2 size={13} /> Remove row
                    </button>
                  </div>
                )}
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
              <span>Total amount: <strong className="font-mono tabular-nums">{formatMoney(composerTotal)}</strong></span>
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
          {/* Group filter tabs — one per category section. */}
          <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter tasks by category">
            <button
              type="button"
              role="tab"
              aria-selected={categoryFilter === 'ALL'}
              onClick={() => setCategoryFilter('ALL')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                categoryFilter === 'ALL'
                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              All
              <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${categoryFilter === 'ALL' ? 'bg-white/20' : 'bg-slate-100'}`}>
                {savedNotes.length}
              </span>
            </button>
            {GROUPS.map((group) => {
              const active = categoryFilter === group.key;
              return (
                <button
                  key={group.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategoryFilter(group.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    active ? `${categoryBadgeClass(group.key)} shadow-sm` : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {group.label}
                  <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${active ? 'bg-white/60' : 'bg-slate-100'}`}>
                    {groupCounts[group.key]}
                  </span>
                </button>
              );
            })}
          </div>
          {loading ? (
            <p className="rounded-xl border border-slate-200/80 bg-white/80 p-5 text-sm text-slate-500 shadow-sm">Loading task notes...</p>
          ) : savedNotes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-500 shadow-sm">No task notes saved yet.</p>
          ) : visibleTaskCount === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-500 shadow-sm">
              No tasks match your search or category filter.
            </p>
          ) : (
            <div className="space-y-6">
              {visibleGroups.map((group) => (
                <section key={group.key} className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${categoryBadgeClass(group.key)}`}>
                        {group.label}
                      </span>
                      <span className="text-xs text-slate-500">{group.hint}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="rounded-full bg-white px-2.5 py-1 font-medium ring-1 ring-inset ring-slate-200">
                        {group.items.length} {group.items.length === 1 ? 'task' : 'tasks'}
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">{formatMoney(group.total)}</span>
                    </div>
                  </div>
                  {group.items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
                      No tasks in this category yet.
                    </p>
                  ) : (
                    <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-6">
                      {group.items.map((note) => (
                        <NoteCard key={note._id} note={note} />
                      ))}
                    </div>
                  )}
                </section>
              ))}
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
              <select
                value={editForm.category || DEFAULT_CATEGORY}
                onChange={(e) => handleEditCategoryChange(e.target.value)}
                aria-label="Task category"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
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
