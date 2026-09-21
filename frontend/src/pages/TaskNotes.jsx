import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Coins,
  PiggyBank,
  Plus,
  Receipt,
  Scale,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import ConfirmModal from '../components/ConfirmModal';
import { SegmentPills, SummaryCard, FuturesCard, FuturesGrid } from '../components/tasknotes/MetricCards';
import CreateTaskModal from '../components/tasknotes/CreateTaskModal';
import TaskBoardColumn from '../components/tasknotes/TaskBoardColumn';
import { BucketTaskCard, TaskBucketAccordion } from '../components/tasknotes/TaskBuckets';
import { TaskDetailModal } from '../components/tasknotes/TaskDetailModal';
import EditTaskNoteModal from '../components/tasknotes/EditTaskNoteModal';
import api from '../api/axios';

/**
 * Lightweight error boundary that keeps the page shell alive even if a risky
 * subsection (new modal, summary cards, bucket data) throws during render.
 * Without it, a single render exception in the new code paths would blank the
 * entire Task Notes page.
 */
class PageSafe extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[TaskNotes.PageSafe] caught render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          <p className="font-semibold">Something went wrong in this section.</p>
          <pre className="mt-2 max-h-40 overflow-auto text-xs font-mono text-red-600">{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  CATEGORIES,
  CATEGORY_GROUPS,
  DEFAULT_CATEGORY,
  amountOfNote,
  categoryBadgeClass,
  categoryLabel,
  displayGroupKey,
  isCompletedNote,
  normalizeCategory,
} from '../utils/taskCategories';
import {
  buildCumulativeSeries,
  deriveFinancialInsights,
  deriveFuturesMetrics,
  isExpenseFamilyCategory,
} from '../utils/financialMetrics';

// The category catalog is re-exported so any module that previously imported it
// from this page keeps working.
export { CATEGORIES, DEFAULT_CATEGORY } from '../utils/taskCategories';

const FUTURES_PANEL_ID = 'task-notes-futures';
const SAVED_NOTES_ID = 'saved-task-notes';

// Segment pills above the metrics grid — real All / Pending / Completed filters
// applied to the task board.
const SEGMENTS = [
  { key: 'ALL', label: 'Tasks' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'COMPLETED', label: 'Completed' },
];


// Top summary cards — always visible, one per category bucket. `seriesKey`
// selects the cumulative sparkline data; the card count is the live number of
// tasks in that bucket.
const TOP_CARDS = [
  {
    key: 'currentSavings',
    label: 'Current Savings',
    formula: 'All "Present Saving" tasks',
    icon: PiggyBank,
    tint: 'from-indigo-50 via-white to-sky-50',
    iconTint: 'bg-indigo-100 text-indigo-700',
    stroke: '#6366f1',
    seriesKey: 'currentSavings',
  },
  {
    key: 'spendExpense',
    label: 'Spend Expense',
    formula: 'All "Present Expense" tasks',
    icon: Receipt,
    tint: 'from-rose-50 via-white to-pink-50',
    iconTint: 'bg-rose-100 text-rose-700',
    stroke: '#e11d48',
    seriesKey: 'spendExpense',
  },
  {
    key: 'plannedIncome',
    label: 'Planned Income',
    formula: 'All "Expected Income" tasks',
    icon: TrendingUp,
    tint: 'from-emerald-50 via-white to-teal-50',
    iconTint: 'bg-emerald-100 text-emerald-700',
    stroke: '#059669',
    seriesKey: 'plannedIncome',
  },
  {
    key: 'plannedExpense',
    label: 'Planned Expense',
    formula: 'All "Expected Expense" tasks',
    icon: TrendingDown,
    tint: 'from-amber-50 via-white to-orange-50',
    iconTint: 'bg-amber-100 text-amber-700',
    stroke: '#d97706',
    seriesKey: 'plannedExpense',
  },
];


// Futures cards — the projected ledger once every planned item settles.
const FUTURES_CARDS = [
  { key: 'overallIncome', label: 'Overall Income', formula: 'Current Savings + Planned Income', icon: Coins, accentText: 'text-emerald-300' },
  { key: 'overallExpense', label: 'Overall Expense', formula: 'Spend Expense + Planned Expense', icon: Receipt, accentText: 'text-rose-300' },
  { key: 'overallExpectedSavings', label: 'Overall Expected Savings', formula: 'Overall Income − Overall Expense', icon: Scale, accentText: 'text-sky-300', toneWhenNegative: true },
];

// Cumulative series selectors — each mirrors the matching bucket total in
// computeSummary(), so the last sparkline point equals the card's value.
const SERIES_SELECTORS = {
  currentSavings: (note) => (normalizeCategory(note.category) === 'PRESENT_HAVING' ? amountOfNote(note) : 0),
  spendExpense: (note) => (isCompletedNote(note) ? amountOfNote(note) : 0),
  plannedIncome: (note) =>
    !isCompletedNote(note) && normalizeCategory(note.category) === 'EXPECTED_INCOME' ? amountOfNote(note) : 0,
  plannedExpense: (note) =>
    !isCompletedNote(note) && normalizeCategory(note.category) === 'EXPECTED_EXPENSE' ? amountOfNote(note) : 0,
};

// Kanban columns. Completed expense tasks are routed into "Filed Expenses" by
// displayGroupKey(), so a task never appears in two columns. The filed column is
// hidden while empty unless it is the column being filtered on.
const BOARD_COLUMNS = [
  { key: 'PRESENT_HAVING', title: 'Current Savings', subtitle: 'Money in hand right now', headerClass: 'bg-[#059669]', icon: PiggyBank, emptyMessage: 'No savings tasks yet.' },
  { key: 'EXPECTED_INCOME', title: 'Planned Income', subtitle: 'Still expected in', headerClass: 'bg-[#2563EB]', icon: TrendingUp, emptyMessage: 'No planned income tasks yet.' },
  { key: 'EXPECTED_EXPENSE', title: 'Planned Expenses', subtitle: 'Still expected out', headerClass: 'bg-[#E11D48]', icon: TrendingDown, emptyMessage: 'No planned expense tasks yet.' },
  { key: 'PRESENT_EXPENSE', title: 'Filed Expenses', subtitle: 'Completed & filed', headerClass: 'bg-[#475569]', icon: Receipt, emptyMessage: 'No filed expenses yet.', hideWhenEmpty: true },
];

// Buckets rendered as collapsible sections below the board.
const BUCKETS = [
  { key: 'PRESENT_EXPENSE', label: 'Completed & filed expenses', hint: 'Expenses already paid and filed', accentClass: 'bg-rose-500', emptyMessage: 'No tasks in this category yet' },
  { key: 'EXPECTED_INCOME', label: 'Pending Income', hint: 'Money still expected in', accentClass: 'bg-emerald-500', emptyMessage: 'No pending income yet', pendingOnly: true },
  { key: 'EXPECTED_EXPENSE', label: 'Pending Expenses', hint: 'Money still expected out', accentClass: 'bg-amber-500', emptyMessage: 'No pending expenses yet', pendingOnly: true },
];

// Local mirror of the backend summary, used when the API response has no
// `summary` payload (older deployments).
const computeSummary = (notes) => {
  const rows = Array.isArray(notes) ? notes : [];
  const presentIncome = rows
    .filter((note) => normalizeCategory(note.category) === 'PRESENT_HAVING')
    .reduce((sum, note) => sum + amountOfNote(note), 0);
  const completed = rows.filter(isCompletedNote);
  // Expense-family rows ("Expense" / "EXPENSE" / "Present Expense" /
  // "PRESENT_EXPENSE") are counted into the Spend Expense total the moment they
  // exist — not only when completed — so the Spend Expense card reacts to a
  // freshly created expense task without a hard refresh.
  const expenseRows = rows.filter((note) => isExpenseFamilyCategory(note?.category));
  const totalExpense = expenseRows.reduce((sum, note) => sum + amountOfNote(note), 0);
  const pendingOf = (category) =>
    rows
      .filter((note) => !isCompletedNote(note) && normalizeCategory(note.category) === category)
      .reduce((sum, note) => sum + amountOfNote(note), 0);

  const totals = {
    totalPresentHaving: presentIncome - totalExpense,
    presentIncome,
    totalExpense,
    totalExpectedIncome: pendingOf('EXPECTED_INCOME'),
    totalExpectedExpense: pendingOf('EXPECTED_EXPENSE'),
    counts: { total: rows.length, completed: completed.length, open: rows.length - completed.length },
  };
  // Mirror the backend payload shape exactly, including the calculated
  // breakdown metrics + chip ratios (see utils/financialMetrics.js).
  return { ...totals, ...deriveFinancialInsights(totals) };
};

const TaskNotes = () => {
  // Defensive defaults: hooks read from context which is null if the provider
  // is absent (e.g. an isolated render), so never destructure raw null.
  const { loading: authLoading = false, isAuthenticated = false } = useAuth() || {};
  const { showToast = () => {} } = useToast() || {};
  const [savedNotes, setSavedNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [editForm, setEditForm] = useState({ description: '', note: '', presentAmount: '', category: DEFAULT_CATEGORY });
  const [noteToDelete, setNoteToDelete] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  // Status segment filter driven by the pills above the metric grid.
  const [statusFilter, setStatusFilter] = useState('ALL');
  // Read-only detail modal opened from a card's eye action.
  const [viewNote, setViewNote] = useState(null);
  // Collapsible category buckets below the board.
  const [openBuckets, setOpenBuckets] = useState({});
  // Summary metrics returned by the API (local recompute is the fallback).
  const [apiSummary, setApiSummary] = useState(null);
  // The Futures projection grid is hidden by default; the "Futures" button in
  // the overview header reveals it on demand.
  const [showFutures, setShowFutures] = useState(false);
  // Modal popup for the task creation flow ("Create Task" button opens this).
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

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

  const handleEditCategoryChange = (newCategory) => {
    setEditForm((prev) => ({ ...prev, category: newCategory }));
  };


  // Prefer the API-computed summary; fall back to the local mirror. Recomputed
  // whenever the task list or the API snapshot changes, so every metric on this
  // page stays real-time.
  const summary = useMemo(() => apiSummary || computeSummary(savedNotes), [apiSummary, savedNotes]);

  // Bucket totals for the always-visible cards + the three Futures projections.
  // `deriveFuturesMetrics` now optionally folds in pending `notes` (e.g. a freshly
  // created expense row) so the Spend Expense card reacts immediately, without a
  // hard refresh or waiting for the API summary to arrive.
  const futures = useMemo(() => deriveFuturesMetrics(summary, savedNotes), [summary, savedNotes]);

  // Live task counts backing each summary card's count chip.
  const bucketCounts = useMemo(
    () => ({
      currentSavings: (savedNotes || []).filter((note) => normalizeCategory(note?.category) === 'PRESENT_HAVING')
        .length,
      // Spend Expense counts any expense-family row, not only completed ones, so a
      // freshly created "Expense" task is counted immediately.
      spendExpense: (savedNotes || []).filter((note) => isExpenseFamilyCategory(note?.category)).length,
      plannedIncome: (savedNotes || []).filter(
        (note) => !isCompletedNote(note) && normalizeCategory(note?.category) === 'EXPECTED_INCOME'
      ).length,
      plannedExpense: (savedNotes || []).filter(
        (note) => !isCompletedNote(note) && normalizeCategory(note?.category) === 'EXPECTED_EXPENSE'
      ).length,
    }),
    [savedNotes]
  );

  // Cumulative trend data for the sparkline cards — one series per bucket, so
  // the last point of each series equals that card's value.
  const trendSeries = useMemo(
    () => ({
      currentSavings: buildCumulativeSeries(savedNotes || [], SERIES_SELECTORS.currentSavings),
      // Spend Expense sparkline includes every expense-family row from the moment
      // it exists (not only completed ones), mirroring the card total above.
      spendExpense: buildCumulativeSeries(savedNotes || [], (note) =>
        isExpenseFamilyCategory(note?.category) ? amountOfNote(note) : 0
      ),
      plannedIncome: buildCumulativeSeries(savedNotes || [], SERIES_SELECTORS.plannedIncome),
      plannedExpense: buildCumulativeSeries(savedNotes || [], SERIES_SELECTORS.plannedExpense),
    }),
    [savedNotes]
  );

  // Any local mutation rewrites `savedNotes` without a refetch, which would
  // leave the API snapshot stale; dropping it makes `summary` fall back to the
  // exact local mirror so the cards always match the visible tasks.
  const invalidateApiSummary = () => setApiSummary(null);

  // Task counts per display group (filter pills) and per status (segments).
  const groupCounts = CATEGORY_GROUPS.reduce((acc, group) => {
    acc[group.key] = (savedNotes || []).filter((note) => displayGroupKey(note) === group.key).length;
    return acc;
  }, {});

  const segmentPills = SEGMENTS.map((segment) => ({
    ...segment,
    count:
      segment.key === 'COMPLETED'
        ? summary.counts?.completed ?? 0
        : segment.key === 'PENDING'
          ? summary.counts?.open ?? 0
          : summary.counts?.total ?? savedNotes.length,
  }));

  const confirmDelete = async () => {
    if (!noteToDelete) return;
    try {
      await api.delete(`/task-notes/${noteToDelete._id}`);
      setSavedNotes((current) => current.filter((note) => note._id !== noteToDelete._id));
      invalidateApiSummary();
      setNoteToDelete(null);
      showToast('Task note deleted successfully.');
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to delete task note';
      setError(message);
      showToast(`Action failed: ${message}`, 'error');
      setNoteToDelete(null);
    }
  };

  // Payload contract with <CreateTaskModal>: receives the modal's draft object
  // and returns true when the task was created, so the modal can reset and the
  // page can close it. Validation mirrors the modal's own required fields.
  const handleCreateTask = async (payload = {}) => {
    const description = String(payload.description || '').trim();
    const note = String(payload.note || '').trim();
    const category = normalizeCategory(payload.category) || DEFAULT_CATEGORY;
    const presentAmount = Number(payload.presentAmount);

    if (!description || !Number.isFinite(presentAmount) || presentAmount < 0) {
      showToast('Each task requires a description and a valid amount.', 'error');
      return false;
    }

    try {
      const res = await api.post('/task-notes', {
        description,
        note: note || null,
        presentAmount,
        category,
      });
      // Optimistic append → every summary card (including Spend Expense, via
      // the expense-family sum) updates instantly, then re-fetch so the API's
      // own summary snapshot stays the source of truth — no reload required.
      setSavedNotes((current) => [...current, res.data.taskNote]);
      invalidateApiSummary();
      showToast('Task created successfully.');
      setIsCreateModalOpen(false);
      await fetchTaskNotes();
      return true;
    } catch (err) {
      showToast(`Action failed: ${err.response?.data?.message || 'Failed to create task note'}`, 'error');
      return false;
    }
  };

  const completeNote = async (note) => {
    try {
      const res = await api.put(`/task-notes/${note._id}`, { status: note.status === 'completed' ? 'open' : 'completed' });
      setSavedNotes((current) => current.map((item) => (item._id === note._id ? res.data.taskNote : item)));
      invalidateApiSummary();
      // Keep the detail modal in sync when it is open on this task.
      setViewNote((current) => (current && current._id === note._id ? res.data.taskNote : current));
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
      invalidateApiSummary();
      setEditingNote(null);
      showToast('Task note updated successfully.');
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to update task note';
      setError(message);
      showToast(`Action failed: ${message}`, 'error');
    }
  };


  // Real-time search across description (title), notes, category labels and
  // amount text. Both the pill label and the form label are indexed so the
  // renamed dropdown options stay searchable.
  const query = search.trim().toLowerCase();
  const matchesSearch = (note) => {
    if (!query) return true;
    const category = normalizeCategory(note.category);
    const details = CATEGORIES.find((entry) => entry.value === category);
    const haystack = [
      note.description,
      note.note,
      categoryLabel(note.category),
      details?.formLabel,
      category,
      String(note.presentAmount ?? ''),
      isCompletedNote(note) ? 'completed' : 'pending',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  };

  // Filter pills operate on the display groups.
  const matchesCategory = (note) => categoryFilter === 'ALL' || displayGroupKey(note) === categoryFilter;
  // Segment pills operate on the completion status.
  const matchesStatus = (note) =>
    statusFilter === 'ALL' || (statusFilter === 'COMPLETED' ? isCompletedNote(note) : !isCompletedNote(note));

  const visibleNotes = savedNotes.filter((note) => matchesSearch(note));

  // Kanban columns: category + search + status filtered, one card per task.
  const boardColumns = BOARD_COLUMNS.map((column) => {
    const items = visibleNotes.filter((note) => displayGroupKey(note) === column.key && matchesCategory(note) && matchesStatus(note));
    return { ...column, items, total: items.reduce((sum, note) => sum + amountOfNote(note), 0) };
  }).filter((column) => !column.hideWhenEmpty || column.items.length > 0 || categoryFilter === column.key);

  // Collapsible buckets below the board. The two pending buckets only ever list
  // open tasks, which is what their headers promise.
  const bucketData = BUCKETS.map((bucket) => {
    const items = visibleNotes.filter(
      (note) =>
        displayGroupKey(note) === bucket.key &&
        (!bucket.pendingOnly || !isCompletedNote(note)) &&
        matchesCategory(note)
    );
    return { ...bucket, items, total: items.reduce((sum, note) => sum + amountOfNote(note), 0) };
  });

  const visibleBoardCount = boardColumns.reduce((count, column) => count + column.items.length, 0);

  // Keep the board on a single row: 3 priority columns, or 4 when the filed
  // expenses column is present.
  const boardGridClass = boardColumns.length > 3 ? 'xl:grid-cols-4' : 'xl:grid-cols-3';

  const toggleBucket = (key) => setOpenBuckets((current) => ({ ...current, [key]: !current[key] }));

  const openDetails = (note) => setViewNote(note);

  const editFromDetails = (note) => {
    setViewNote(null);
    openEdit(note);
  };

  const cardActions = {
    onEdit: openEdit,
    onView: openDetails,
    onDelete: setNoteToDelete,
    onToggleComplete: completeNote,
  };


  return (
    <PageSafe>
      <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6 lg:px-8">
        {/* 1. Workspace breadcrumb, title and header controls ------------------ */}
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              <span>Workspace</span>
              <ChevronRight size={12} aria-hidden="true" />
              <span className="text-brand-600">Task Notes</span>
            </nav>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Task Notes</h1>
            <p className="mt-1 text-sm text-slate-500">
              Track income, expenses, and expected totals in your focused workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
              <ClipboardList size={13} className="text-brand-600" aria-hidden="true" />
              <span className="font-mono tabular-nums">{savedNotes.length}</span>
              total {savedNotes.length === 1 ? 'task' : 'tasks'}
            </span>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="Create a new task note"
            >
              <Plus size={16} />
              Create Task
            </button>
          </div>
        </header>


        {/* 2. Financial overview — 4 always-visible bucket cards + Futures ----- */}
        <section className="mb-8" aria-label="Financial summary">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-slate-900">Financial overview</h2>
                <p className="mt-0.5 text-xs text-slate-500">Recalculated in real time from your saved task amounts.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFutures((prev) => !prev)}
                  aria-expanded={showFutures}
                  aria-controls={FUTURES_PANEL_ID}
                  title={showFutures ? 'Hide the Futures projection' : 'Show the Futures projection'}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                    showFutures
                      ? 'border-indigo-500 bg-gradient-to-br from-indigo-600 to-indigo-700 text-white hover:from-indigo-500 hover:to-indigo-600'
                      : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'
                  }`}
                >
                  <Sparkles size={16} aria-hidden="true" />
                  Futures
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={`transition-transform duration-300 ${showFutures ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>
            </div>
          <SegmentPills segments={segmentPills} active={statusFilter} onChange={setStatusFilter} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {TOP_CARDS.map((card) => (
              <SummaryCard
                key={card.key}
                label={card.label}
                formula={card.formula}
                count={bucketCounts[card.key]}
                value={futures[card.key]}
                icon={card.icon}
                tint={card.tint}
                iconTint={card.iconTint}
                series={trendSeries[card.seriesKey] || []}
                stroke={card.stroke}
              />
            ))}
          </div>

          <FuturesGrid open={showFutures} panelId={FUTURES_PANEL_ID}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-slate-900">Futures</h3>
                <p className="mt-0.5 text-xs text-slate-500">Projected totals once every planned item settles.</p>
              </div>
              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-medium text-indigo-700">
                {FUTURES_CARDS.length} projections
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {FUTURES_CARDS.map((card) => (
                <FuturesCard
                  key={card.key}
                  label={card.label}
                  formula={card.formula}
                  value={futures[card.key]}
                  icon={card.icon}
                  accentText={card.accentText}
                  toneWhenNegative={card.toneWhenNegative}
                />
              ))}
            </div>
          </FuturesGrid>
        </section>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-700">
            {success}
          </div>
        )}

        {/* 3. Saved task notes — kanban board -------------------------------- */}
        <section id={SAVED_NOTES_ID} className="mb-10 scroll-mt-24">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Saved Task Notes</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {visibleBoardCount} {visibleBoardCount === 1 ? 'task' : 'tasks'} on the board · grouped by priority bucket.
              </p>
            </div>
            <div className="relative w-full lg:w-80">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search task by title, description..."
                aria-label="Search task notes"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm text-slate-700 shadow-sm transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
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

          {/* Category filter pills — one per display group. */}
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
            {CATEGORY_GROUPS.map((group) => {
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
            <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
              Loading task notes...
            </p>
          ) : savedNotes.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              No task notes saved yet. Add your first task above.
            </p>
          ) : visibleBoardCount === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              No tasks match your search or filters.
            </p>
          ) : (
            <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${boardGridClass}`}>
              {boardColumns.map((column) => (
                <TaskBoardColumn
                  key={column.key}
                  title={column.title}
                  subtitle={column.subtitle}
                  headerClass={column.headerClass}
                  icon={column.icon}
                  items={column.items}
                  total={column.total}
                  emptyMessage={column.emptyMessage}
                  {...cardActions}
                />
              ))}
            </div>
          )}
        </section>


        {/* 5. Category buckets below the board -------------------------------- */}
        <section className="space-y-3" aria-label="Category buckets">
          {bucketData.map((bucket) => (
            <TaskBucketAccordion
              key={bucket.key}
              label={bucket.label}
              hint={bucket.hint}
              accentClass={bucket.accentClass}
              count={bucket.items.length}
              total={bucket.total}
              emptyMessage={bucket.emptyMessage}
              open={!!openBuckets[bucket.key]}
              onToggle={() => toggleBucket(bucket.key)}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {bucket.items.map((note) => (
                  <BucketTaskCard key={note._id} note={note} {...cardActions} />
                ))}
              </div>
            </TaskBucketAccordion>
          ))}
        </section>
      </main>

      {/* 6. Overlays --------------------------------------------------------- */}
      {viewNote && (
        <TaskDetailModal
          note={viewNote}
          onClose={() => setViewNote(null)}
          onEdit={editFromDetails}
          onDelete={setNoteToDelete}
          onToggleComplete={completeNote}
        />
      )}

      {editingNote && (
        <EditTaskNoteModal
          form={editForm}
          onChange={(name, value) => setEditForm((prev) => ({ ...prev, [name]: value }))}
          onCategoryChange={handleEditCategoryChange}
          onSubmit={saveEdit}
          onCancel={() => setEditingNote(null)}
        />
      )}

      <ConfirmModal
        open={!!noteToDelete}
        title="Delete Task Note"
        message={`Are you sure you want to delete "${noteToDelete?.description}"?`}
        onConfirm={confirmDelete}
        onCancel={() => setNoteToDelete(null)}
      />

      <CreateTaskModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateTask}
      />
      </div>
    </PageSafe>
  );
};

export default TaskNotes;

