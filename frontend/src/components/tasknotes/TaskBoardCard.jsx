import React from 'react';
import { CalendarDays, Check, Eye, Pencil, Trash2 } from 'lucide-react';
import { amountOfNote, getCategoryDetails, isCompletedNote } from '../../utils/taskCategories';
import { formatINR } from '../../utils/financialMetrics';
import { formatShortDate } from '../../utils/dates';

const actionButton =
  'inline-flex flex-1 items-center justify-center rounded-lg py-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:focus-visible:ring-brand-400/60';

/**
 * Kanban task card: title, account/category badge, status + date chips, the
 * amount, and the edit / complete / view / delete action bar.
 *
 * NOTE: the model has no `dueDate` field, so the date chip reports the real
 * tracked date — "Added" while open, "Filed" once completed.
 */
export const TaskBoardCard = ({ note, onEdit, onView, onDelete, onToggleComplete }) => {
  const details = getCategoryDetails(note.category);
  const complete = isCompletedNote(note);
  const stamp = complete
    ? note.completedAt || note.updatedAt || note.createdAt
    : note.createdAt || note.updatedAt;

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 flex-1 text-sm font-semibold leading-5 text-ink" title={note.description}>
          {note.description}
        </p>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-4 ${details.colorClass}`}
          title={details.label}
        >
          {details.label}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
            complete
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/20'
              : 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/20'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${complete ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {complete ? 'Completed' : 'Open'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-[10px] font-semibold text-ink-muted ring-1 ring-inset ring-line">
          <CalendarDays size={11} />
          {complete ? 'Filed' : 'Added'} {formatShortDate(stamp)}
        </span>
      </div>

      {note.note?.trim() ? (
        <p className="mt-2 line-clamp-2 text-[11px] italic leading-4 text-ink-muted" title={note.note}>
          {note.note}
        </p>
      ) : null}

      <p className="mt-3 truncate font-mono text-xl font-bold tabular-nums text-ink">
        {formatINR(amountOfNote(note))}
      </p>

      <div className="mt-3 flex items-center gap-1 border-t border-line/70 pt-2.5">
        <button
          type="button"
          onClick={() => onEdit(note)}
          title="Edit task"
          aria-label="Edit task"
          className={`${actionButton} text-ink-muted hover:bg-subtle hover:text-ink`}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => onView(note)}
          title="View details"
          aria-label="View details"
          className={`${actionButton} text-ink-muted hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-slate-800 dark:hover:text-brand-400`}
        >
          <Eye size={14} />
        </button>
        <button
          type="button"
          onClick={() => onToggleComplete(note)}
          title={complete ? 'Reopen task' : 'Mark task complete'}
          aria-label={complete ? 'Reopen task' : 'Mark task complete'}
          className={`${actionButton} ${
            complete
              ? 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950'
              : 'text-ink-muted hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950 dark:hover:text-emerald-400'
          }`}
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(note)}
          title="Delete task"
          aria-label="Delete task"
          className={`${actionButton} text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950 dark:hover:text-rose-400`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
};
