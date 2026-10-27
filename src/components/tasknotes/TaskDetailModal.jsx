import React from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { CATEGORY_FORM_OPTIONS, DEFAULT_CATEGORY, amountOfNote, getCategoryDetails, isCompletedNote } from '../../utils/taskCategories';
import { formatINR } from '../../utils/financialMetrics';
import { formatShortDate } from '../../utils/dates';

const backdrop = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm dark:bg-black/60';
const panel = 'w-full rounded-2xl border border-line bg-surface p-5 shadow-2xl sm:p-6';
const closeButton = 'rounded-lg p-1 text-ink-muted transition-colors hover:bg-subtle hover:text-ink-soft';
const inputBox =
  'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';
const labelText = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted';

/** Read-only "View details" modal opened from a task card's eye action. */
export const TaskDetailModal = ({ note, onClose, onEdit, onDelete, onToggleComplete }) => {
  if (!note) return null;
  const details = getCategoryDetails(note.category);
  const complete = isCompletedNote(note);
  const rows = [
    { label: 'Category', value: details.label },
    { label: 'Status', value: complete ? 'Completed' : 'Open' },
    { label: 'Amount', value: formatINR(amountOfNote(note)), mono: true },
    { label: complete ? 'Filed on' : 'Added on', value: formatShortDate(complete ? note.completedAt || note.updatedAt : note.createdAt) },
    { label: 'Last updated', value: formatShortDate(note.updatedAt || note.createdAt) },
  ];

  return (
    <div className={backdrop} role="dialog" aria-modal="true" aria-label="Task details" onClick={onClose}>
      <div className={`${panel} max-w-lg`} onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">Task details</p>
            <h3 className="mt-1 truncate text-lg font-semibold tracking-tight text-ink" title={note.description}>
              {note.description}
            </h3>
          </div>
          <button type="button" onClick={onClose} className={closeButton} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${details.colorClass}`}>{details.label}</span>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
              complete
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/20'
                : 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/20'
            }`}
          >
            {complete ? 'Completed' : 'Open'}
          </span>
        </div>

        <p className="mt-4 font-mono text-3xl font-bold tabular-nums text-ink">{formatINR(amountOfNote(note))}</p>

        <dl className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl border border-line/70">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{row.label}</dt>
              <dd className={`truncate text-xs font-semibold text-ink-soft ${row.mono ? 'font-mono tabular-nums' : ''}`}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        {note.note?.trim() ? (
          <p className="mt-3 rounded-xl bg-subtle p-3 text-xs italic leading-5 text-ink-soft">{note.note}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => { onDelete(note); onClose(); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3.5 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950"
          >
            <Trash2 size={15} /> Delete
          </button>
          <button
            type="button"
            onClick={() => onToggleComplete(note)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-subtle hover:text-ink"
          >
            <Check size={15} /> {complete ? 'Reopen' : 'Mark complete'}
          </button>
          <button
            type="button"
            onClick={() => onEdit(note)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md"
          >
            <Pencil size={15} /> Edit task
          </button>
        </div>
      </div>
    </div>
  );
};
