import React, { useEffect, useId, useRef, useState } from 'react';
import {
  BellRing,
  Bold,
  Clock,
  Flame,
  Italic,
  Leaf,
  List,
  LoaderCircle,
  Sparkles,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import api from '../../api/axios';
import {
  CATEGORY_FORM_OPTIONS,
  DEFAULT_CATEGORY,
  getCategoryDetails,
} from '../../utils/taskCategories';
import { formatINR } from '../../utils/financialMetrics';

// ─────────────────────────────────────────────────────────────────────────────
// "Royal ledger" design language for the Create Task Note composer.
//
// White marble panel + silver filigree ornaments + royal-blue (brand) accents,
// i.e. the polished mobile-game HUD treatment applied to a real finance form.
// Every visual class is a full literal string so Tailwind's JIT compiler can
// statically detect it, and all three backend-supported composer extras
// (priority, assignee, reminder) are wired to real state — nothing is decorative.
// ─────────────────────────────────────────────────────────────────────────────

const NOTE_MAX_LENGTH = 2000;
const DEFAULT_PRIORITY = 'MEDIUM';

// Mini rich-text toolbar for the note field (markdown inserts, no dependency).
const NOTE_TOOLS = [
  { key: 'bold', label: 'Bold', Icon: Bold },
  { key: 'italic', label: 'Italic', Icon: Italic },
  { key: 'list', label: 'Bulleted list', Icon: List },
];

// Micro-labels: small, muted, wide-tracked — the Linear/Notion label treatment.
const labelText = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted';
const labelRow = 'mb-2 flex items-center justify-between gap-2';
// Shared field chrome: marble-white fill (slate-900 fill in dark mode), soft
// blue inset shading, royal-blue focus ring. 48px tall so every control shares
// one baseline.
const fieldBox =
  'w-full rounded-xl border border-line bg-gradient-to-b from-white to-blue-50/40 text-sm text-ink shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)] placeholder:text-ink-faint outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:from-slate-900 dark:to-slate-800/70 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]';
const fieldHeight = `${fieldBox} h-12 px-3.5`;
// Ornate dark-blue action (Set Reminder): bevelled royal gradient + blue backlight.
const royalButton =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-brand-700/60 bg-gradient-to-b from-brand-600 to-blue-800 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(29,78,216,0.95),inset_0_1px_0_rgba(255,255,255,0.25)] transition-all hover:from-brand-500 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-surface dark:focus-visible:ring-offset-slate-900';
// Silver-bordered secondary action (Cancel) — darkened metals for dark mode.
const silverButton =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-gradient-to-b from-white to-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.06)] transition-all hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-slate-600 dark:from-slate-800 dark:to-slate-700 dark:text-slate-300 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.4)] dark:hover:border-slate-500 dark:hover:text-slate-100';
// Diamond select marker (the "◆" arrow from the brief) — one rotated square.
const diamondMarker =
  'pointer-events-none absolute right-4 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b-2 border-r-2 border-current';

/**
 * Priority pill ladder. `activeClass` is the complete selected treatment
 * (border + tinted gradient + text colour + neon aura); Medium's cyan aura is
 * the reference "selected" look from the design brief.
 */
export const PRIORITY_OPTIONS = [
  {
    value: 'HIGH',
    label: 'High',
    Icon: Flame,
    iconClass: 'text-rose-500 dark:text-rose-400',
    activeClass:
      'border-rose-300 bg-gradient-to-b from-rose-50 to-white text-rose-700 shadow-[0_0_18px_rgba(244,63,94,0.35)] dark:border-rose-800 dark:from-rose-950 dark:to-slate-900 dark:text-rose-300',
  },
  {
    value: 'MEDIUM',
    label: 'Medium',
    Icon: Zap,
    iconClass: 'text-cyan-500 dark:text-cyan-400',
    activeClass:
      'border-cyan-300 bg-gradient-to-b from-cyan-50 to-white text-cyan-700 shadow-[0_0_22px_rgba(34,211,238,0.55)] dark:border-cyan-800 dark:from-cyan-950 dark:to-slate-900 dark:text-cyan-300',
  },
  {
    value: 'LOW',
    label: 'Low',
    Icon: Leaf,
    iconClass: 'text-emerald-500 dark:text-emerald-400',
    activeClass:
      'border-emerald-300 bg-gradient-to-b from-emerald-50 to-white text-emerald-700 shadow-[0_0_18px_rgba(16,185,129,0.35)] dark:border-emerald-800 dark:from-emerald-950 dark:to-slate-900 dark:text-emerald-300',
  },
  {
    value: 'CRITICAL',
    label: 'Critical',
    Icon: Sparkles,
    iconClass: 'text-violet-500 dark:text-violet-400',
    activeClass:
      'border-violet-300 bg-gradient-to-b from-violet-50 to-white text-violet-700 shadow-[0_0_20px_rgba(139,92,246,0.45)] dark:border-violet-800 dark:from-violet-950 dark:to-slate-900 dark:text-violet-300',
  },
];

/** Fresh draft for every open; a factory avoids sharing one mutable object. */
export const createEmptyDraft = () => ({
  description: '',
  note: '',
  category: DEFAULT_CATEGORY,
  presentAmount: '',
  priority: DEFAULT_PRIORITY,
  assignedTo: '',
  reminderAt: '',
});

/** Display name for a member record (new + legacy keys), never empty. */
export const memberDisplayName = (member) =>
  String(member?.workerName || member?.name || member?.jNo || 'Team member').trim();

const memberInitial = (member) => memberDisplayName(member).slice(0, 1).toUpperCase();

/** "24 Sep, 04:30 pm" style chip label for a chosen reminder. */
const formatReminder = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Set Reminder';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Markdown insertion for the note toolbar. Returns the text to insert plus the
 * caret offset to apply afterwards, so typing continues inside the markers.
 */
const buildNoteInsertion = (tool, selected) => {
  if (tool === 'bold') {
    const text = `**${selected}**`;
    return { text, caretOffset: selected ? text.length : 2 };
  }
  if (tool === 'italic') {
    const text = `_${selected}_`;
    return { text, caretOffset: selected ? text.length : 1 };
  }
  if (selected) {
    const text = selected
      .split('\n')
      .map((line) => `- ${line.replace(/^[-*]\s+/, '')}`)
      .join('\n');
    return { text, caretOffset: text.length };
  }
  return { text: '- ', caretOffset: 2 };
};

/** Silver filigree corner ornament; rotate for the other three corners. */
const FiligreeCorner = ({ className = '' }) => (
  <svg
    viewBox="0 0 72 72"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    className={`pointer-events-none absolute z-10 h-14 w-14 text-slate-300 sm:h-16 sm:w-16 ${className}`}
  >
    <path d="M3 30C3 15 15 3 30 3" strokeWidth="1.6" />
    <path d="M3 46C3 21 21 3 46 3" strokeWidth="1" strokeOpacity="0.7" />
    <path d="M11 22c3.2-6.2 5.6-8.6 11.8-11.8" strokeWidth="1.2" strokeOpacity="0.9" />
    <path d="M11 7.5 14.5 11 11 14.5 7.5 11z" strokeWidth="1.1" />
    <circle cx="21" cy="21" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

/** Ornate silver shield crest with the royal-blue phoenix emblem. */
const PhoenixCrest = ({ gradientId }) => (
  <svg
    viewBox="0 0 48 56"
    aria-hidden="true"
    className="h-11 w-10 shrink-0 drop-shadow-[0_6px_12px_rgba(29,78,216,0.28)]"
  >
    <defs>
      <linearGradient id={`${gradientId}-silver`} x1="0" y1="0" x2="0.9" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="45%" stopColor="#e2e8f0" />
        <stop offset="100%" stopColor="#94a3b8" />
      </linearGradient>
      <linearGradient id={`${gradientId}-blue`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="55%" stopColor="#2563eb" />
        <stop offset="100%" stopColor="#1e3a8a" />
      </linearGradient>
    </defs>
    {/* Polished silver shield */}
    <path
      d="M24 1.5 45.5 9.2V29c0 12.9-9.4 21.7-21.5 25.6C11.9 50.7 2.5 41.9 2.5 29V9.2z"
      fill={`url(#${gradientId}-silver)`}
      stroke="#64748b"
      strokeWidth="1.1"
    />
    <path
      d="M24 5.2 42 11.6V29c0 11.1-7.8 18.6-18 22.2C13.8 47.6 6 40.1 6 29V11.6z"
      fill="#f8fafc"
      stroke="#cbd5e1"
      strokeWidth="0.9"
    />
    {/* Blue phoenix: crest, spread wings, body, tail */}
    <path
      d="M24 13.4c1.9 2.6 2.9 4.9 3 7.2"
      fill="none"
      stroke={`url(#${gradientId}-blue)`}
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <path
      d="M21 21.5c-4-2.9-7.9-2.7-10.6.4 3.4.5 6 1.9 7.9 4.2z"
      fill={`url(#${gradientId}-blue)`}
    />
    <path
      d="M27 21.5c4-2.9 7.9-2.7 10.6.4-3.4.5-6 1.9-7.9 4.2z"
      fill={`url(#${gradientId}-blue)`}
    />
    <path
      d="M24 17.6c3.1 3.3 4.7 6.4 4.7 9.2 0 3-2.1 5.1-4.7 5.1s-4.7-2.1-4.7-5.1c0-2.8 1.6-5.9 4.7-9.2z"
      fill={`url(#${gradientId}-blue)`}
    />
    <path
      d="M24 33.6c1.7 3.6 2 6.9 1.1 10.8-.15.6-.95.6-1.1 0-.9-3.9-.6-7.2 1.1-10.8z"
      fill={`url(#${gradientId}-blue)`}
    />
  </svg>
);

export default function CreateTaskModal({ open, onClose, onSubmit }) {
  const dialogId = useId();
  // SVG `url(#id)` references must be selector-safe, so strip React's ":r0:"
  // punctuation out of the gradient id.
  const gradientId = `crest${dialogId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [form, setForm] = useState(createEmptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersStatus, setMembersStatus] = useState('idle');
  const noteRef = useRef(null);
  const descriptionRef = useRef(null);
  // Caret position to restore after a toolbar insert (the textarea is controlled).
  const pendingCaret = useRef(null);

  const updateField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
  const resetForm = () => setForm(createEmptyDraft());

  // Every close path (X, Cancel, backdrop, Esc) clears the draft first, so the
  // next open always starts from a clean form.
  const handleClose = () => {
    resetForm();
    setSubmitting(false);
    setShowReminder(false);
    onClose();
  };

  // Esc closes the dialog and the page behind it stops scrolling while it is
  // open (both restored on unmount, so the body never gets stuck).
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') handleClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Team members power the "Assign to" dropdown. A failed request degrades to an
  // empty (still usable) list instead of blocking the composer.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setMembersStatus('loading');
    api
      .get('/members')
      .then((res) => {
        if (cancelled) return;
        setMembers(Array.isArray(res.data?.members) ? res.data.members : []);
        setMembersStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setMembers([]);
        setMembersStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Land the caret in the first required field once the entrance animation ends.
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => descriptionRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Restore the caret after a toolbar insert.
  useEffect(() => {
    const caret = pendingCaret.current;
    if (!caret || !noteRef.current) return;
    pendingCaret.current = null;
    noteRef.current.focus();
    noteRef.current.setSelectionRange(caret[0], caret[1]);
  }, [form.note]);

  /**
   * Toolbar inserts: wraps the current selection (or drops ready-to-type markers
   * at the caret), clamps to the 2000-character schema limit and restores the
   * caret once React has committed the new value.
   */
  const applyNoteFormat = (tool) => {
    const element = noteRef.current;
    const current = form.note || '';
    const start =
      element && typeof element.selectionStart === 'number' ? element.selectionStart : current.length;
    const end = element && typeof element.selectionEnd === 'number' ? element.selectionEnd : current.length;
    const { text, caretOffset } = buildNoteInsertion(tool, current.slice(start, end));
    const next = `${current.slice(0, start)}${text}${current.slice(end)}`.slice(0, NOTE_MAX_LENGTH);
    const caret = Math.min(start + caretOffset, next.length);
    pendingCaret.current = [caret, caret];
    updateField('note', next);
  };

  // Ctrl/Cmd + B / I shortcuts for the two inline formats.
  const handleNoteKeyDown = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key !== 'b' && key !== 'i') return;
    event.preventDefault();
    applyNoteFormat(key === 'b' ? 'bold' : 'italic');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const succeeded = await onSubmit({ ...form });
      if (succeeded) {
        resetForm();
        setShowReminder(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  // Current category metadata drives the select's colour dot.
  const activeCategory = getCategoryDetails(form.category);
  const selectedMember = members.find((member) => member._id === form.assignedTo) || null;
  const noteLength = (form.note || '').length;
  const membersHint =
    membersStatus === 'loading'
      ? 'Loading team members…'
      : membersStatus === 'error'
        ? 'Team members could not be loaded.'
        : members.length === 0
          ? 'No team members yet.'
          : 'Optional — leave blank to keep the task unassigned.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dialogId}-title`}
      aria-describedby={`${dialogId}-desc`}
    >
      {/* Backdrop is a *sibling* of the card and sits on z-0, so the card (z-10)
          always paints above it. Clicking it closes through handleClose. */}
      <div
        className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.30),rgba(2,6,23,0.74))] backdrop-blur-md animate-modal-backdrop"
        onClick={handleClose}
        aria-hidden="true"
      />

      <form
        id={`${dialogId}-form`}
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[26px] border border-white/70 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_58%,#eef4fd_100%)] shadow-[0_45px_90px_-25px_rgba(2,6,23,0.75),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-brand-900/10 animate-modal-pop dark:border-white/10 dark:bg-[linear-gradient(180deg,#0f172a_0%,#0b1220_58%,#0a1120_100%)] dark:ring-white/10"
      >
        {/* Marble veining + soft blue backlight */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_15%_-10%,rgba(37,99,235,0.16),transparent_55%),radial-gradient(circle_at_92%_6%,rgba(148,163,184,0.22),transparent_45%),radial-gradient(circle_at_50%_120%,rgba(29,78,216,0.14),transparent_60%)]"
        />
        {/* Silver filigree corner ornaments */}
        <FiligreeCorner className="left-2.5 top-2.5" />
        <FiligreeCorner className="right-2.5 top-2.5 rotate-90" />
        <FiligreeCorner className="bottom-2.5 right-2.5 rotate-180" />
        <FiligreeCorner className="bottom-2.5 left-2.5 -rotate-90" />

        <div className="relative z-10">
          {/* Header — ornate crest, title, close */}
          <header className="flex items-start gap-3.5 border-b border-slate-200/70 bg-gradient-to-r from-white via-blue-50/60 to-white px-5 py-4 sm:px-6 dark:border-slate-700/70 dark:from-slate-900 dark:via-slate-800/60 dark:to-slate-900">
            <PhoenixCrest gradientId={gradientId} />
            <div className="min-w-0 flex-1">
              <h2
                id={`${dialogId}-title`}
                className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-xl"
              >
                Create Task Note
              </h2>
              <p id={`${dialogId}-desc`} className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:text-[13px]">
                Log a payment, saving or planned expense for your ledger.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close dialog"
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:hover:bg-white/10 dark:hover:text-brand-300"
            >
              <X size={16} />
            </button>
          </header>

          {/* Scrollable body */}
          <div className="max-h-[min(76vh,42rem)] space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            {/* 1. Priority pills */}
            <fieldset>
              <legend className={labelText}>Priority</legend>
              <div
                role="radiogroup"
                aria-label="Priority"
                className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {PRIORITY_OPTIONS.map((option) => {
                  const selected = form.priority === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${option.label} priority`}
                      onClick={() => updateField('priority', option.value)}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                        selected
                          ? option.activeClass
                          : 'border-slate-200 bg-white/80 text-slate-500 hover:border-blue-200 hover:bg-blue-50/70 hover:text-slate-700 dark:border-slate-700 dark:bg-white/[0.06] dark:text-slate-400 dark:hover:border-blue-800 dark:hover:bg-blue-950/40 dark:hover:text-slate-200'
                      }`}
                    >
                      <option.Icon
                        size={15}
                        className={selected ? option.iconClass : 'text-slate-400 dark:text-slate-500'}
                        aria-hidden="true"
                      />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* 2. Task description */}
            <label className="block">
              <span className={labelText}>Task description</span>
              <input
                ref={descriptionRef}
                name="description"
                type="text"
                required
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                className={`${fieldHeight} mt-2`}
                placeholder="e.g. Pay the electrician for site work"
                aria-label="Task description"
              />
            </label>

            {/* 3. Note (optional) with mini rich-text toolbar */}
            <div>
              <div className={labelRow}>
                <label htmlFor={`${dialogId}-note`} className={labelText}>
                  Note (optional)
                </label>
                <span className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/85 p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-800/85">
                  {NOTE_TOOLS.map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyNoteFormat(key)}
                      aria-label={`Insert ${label.toLowerCase()}`}
                      title={label}
                      className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-blue-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-slate-400 dark:hover:bg-blue-950/50 dark:hover:text-brand-300"
                    >
                      <Icon size={14} aria-hidden="true" />
                    </button>
                  ))}
                </span>
              </div>
              <textarea
                id={`${dialogId}-note`}
                ref={noteRef}
                name="note"
                rows={3}
                maxLength={NOTE_MAX_LENGTH}
                value={form.note}
                onChange={(event) => updateField('note', event.target.value)}
                onKeyDown={handleNoteKeyDown}
                className={`${fieldBox} min-h-[6.75rem] resize-y px-3.5 py-3 leading-6`}
                placeholder="Add context, reference numbers or the follow-up steps..."
                aria-label="Task note (optional)"
              />
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Markdown: **bold**, _italic_, - list</span>
                <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  ({noteLength}/{NOTE_MAX_LENGTH})
                </span>
              </div>
            </div>

            {/* 4. Category + amount */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelText}>Category</span>
                <div className="relative mt-2">
                  <span
                    className="pointer-events-none absolute left-3.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center"
                    aria-hidden="true"
                  >
                    <span
                      className={`block h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-800 ${activeCategory.dotClass}`}
                    />
                  </span>
                  <select
                    name="category"
                    value={form.category}
                    onChange={(event) => updateField('category', event.target.value)}
                    className={`${fieldHeight} appearance-none pl-9 pr-11 font-medium text-brand-900 dark:text-brand-200`}
                    aria-label="Task category"
                  >
                    {CATEGORY_FORM_OPTIONS.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.formLabel}
                      </option>
                    ))}
                  </select>
                  <span className={`${diamondMarker} text-brand-600 dark:text-brand-400`} aria-hidden="true" />
                </div>
              </label>

              <label className="block">
                <span className={labelText}>Amount</span>
                <div className="relative mt-2">
                  <span
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm font-semibold text-brand-700 dark:text-brand-400"
                    aria-hidden="true"
                  >
                    ₹
                  </span>
                  <input
                    name="presentAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    required
                    value={form.presentAmount}
                    onChange={(event) => updateField('presentAmount', event.target.value)}
                    className={`${fieldHeight} pl-9 pr-3.5 text-right font-mono text-base font-semibold tabular-nums`}
                    placeholder="0.00"
                    aria-label="Amount"
                  />
                </div>
                <span className="mt-1.5 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Required field
                </span>
              </label>
            </div>

            {/* 5. Assign to + reminder */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <label className="block">
                <span className={labelText}>Assign to</span>
                <div className="relative mt-2">
                  <span
                    className="pointer-events-none absolute left-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-b from-blue-100 to-blue-200 text-[11px] font-bold uppercase text-brand-700 ring-1 ring-white dark:from-blue-900/70 dark:to-blue-800/70 dark:text-blue-200 dark:ring-slate-800"
                    aria-hidden="true"
                  >
                    {selectedMember ? memberInitial(selectedMember) : <UserRound size={14} />}
                  </span>
                  <select
                    name="assignedTo"
                    value={form.assignedTo}
                    onChange={(event) => updateField('assignedTo', event.target.value)}
                    className={`${fieldHeight} appearance-none pl-12 pr-11 font-medium`}
                    aria-label="Assign to team member"
                  >
                    <option value="">Select Team Member</option>
                    {members.map((member) => (
                      <option key={member._id} value={member._id}>
                        {memberDisplayName(member)}
                      </option>
                    ))}
                  </select>
                  <span className={`${diamondMarker} text-brand-600 dark:text-brand-400`} aria-hidden="true" />
                </div>
                <span className="mt-1.5 block text-[11px] text-slate-500 dark:text-slate-400">{membersHint}</span>
              </label>

              <div className="sm:pt-6">
                <button
                  type="button"
                  onClick={() => setShowReminder((current) => !current)}
                  aria-expanded={showReminder}
                  aria-controls={`${dialogId}-reminder`}
                  className={`${royalButton} h-12 w-full sm:w-auto`}
                >
                  {form.reminderAt ? (
                    <BellRing size={16} aria-hidden="true" />
                  ) : (
                    <Clock size={16} aria-hidden="true" />
                  )}
                  {form.reminderAt ? formatReminder(form.reminderAt) : 'Set Reminder'}
                </button>
              </div>
            </div>

            {showReminder && (
              <div
                id={`${dialogId}-reminder`}
                className="flex flex-col gap-3 rounded-2xl border border-blue-200/80 bg-gradient-to-b from-blue-50/80 to-white p-3.5 sm:flex-row sm:items-end dark:border-blue-900/70 dark:from-blue-950/60 dark:to-slate-900"
              >
                <label className="block flex-1">
                  <span className={labelText}>Remind me at</span>
                  <input
                    name="reminderAt"
                    type="datetime-local"
                    value={form.reminderAt}
                    onChange={(event) => updateField('reminderAt', event.target.value)}
                    className={`${fieldBox} mt-2 h-11 px-3.5 font-mono text-[13px]`}
                    aria-label="Reminder date and time"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateField('reminderAt', '')}
                    disabled={!form.reminderAt}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReminder(false)}
                    className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer — estimation breakdown + actions */}
          <footer className="relative flex flex-col gap-3 border-t border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-blue-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-slate-700/80 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/40">
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-brand-500 to-blue-800 text-white shadow-[0_8px_18px_-8px_rgba(29,78,216,0.9)]"
                aria-hidden="true"
              >
                <Sparkles size={16} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Total amount (Est.)
                </p>
                <p className="font-mono text-lg font-semibold tabular-nums text-brand-900 dark:text-brand-200">
                  Total: {formatINR(form.presentAmount)}
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
              <button
                type="button"
                onClick={handleClose}
                className={`${silverButton} w-full sm:w-auto`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-brand-500 via-brand-600 to-blue-800 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_34px_-14px_rgba(29,78,216,1),inset_0_1px_0_rgba(255,255,255,0.3)] transition-all hover:via-brand-500 hover:to-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {/* Royal-blue backlight + sparkle dust */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 animate-rune-glow bg-[radial-gradient(circle_at_20%_130%,rgba(255,255,255,0.55),transparent_62%)]"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1 animate-pulse text-[9px] leading-none text-blue-100"
                >
                  ✦
                </span>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-1 right-3 animate-pulse text-[9px] leading-none text-blue-100"
                >
                  ✦
                </span>
                {submitting ? (
                  <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles size={15} className="text-blue-100" aria-hidden="true" />
                )}
                <span className="relative">{submitting ? 'Saving...' : 'Add Task'}</span>
              </button>
            </div>
          </footer>
        </div>
      </form>
    </div>
  );
}
