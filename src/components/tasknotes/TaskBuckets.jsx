import React from 'react';
import { CalendarDays, Check, ChevronDown, Eye, Pencil, Trash2 } from 'lucide-react';
import { amountOfNote, getCategoryDetails, isCompletedNote } from '../../utils/taskCategories';
import { formatINR } from '../../utils/financialMetrics';
import { formatShortDate } from '../../utils/dates';

const iconButton =
  'inline-flex flex-1 items-center justify-center rounded-lg py-1.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:focus-visible:ring-brand-400/60';

/**
 * Bucket card with a compact sub-breakdown table, used inside the collapsible
 * category buckets below the board.
 */
export const BucketTaskCard = ({ note, onEdit, onView, onDelete, onToggleComplete }) => {
  const details = getCategoryDetails(note.category);
  const complete = isCompletedNote(note);
  const filedStamp = note.completedAt || note.updatedAt;
  const rows = [
    { label: 'Category', value: details.label },
    { label: 'Status', value: complete ? 'Completed' : 'Pending' },
    { label: 'Amount', value: formatINR(amountOfNote(note)), mono: true },
    { label: complete ? 'Filed on' : 'Added on', value: formatShortDate(complete ? filedStamp : note.createdAt) },
  ];

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 flex-1 text-sm font-semibold leading-5 text-ink" title={note.description}>
          {note.description}
        </p>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-4 ${details.colorClass}`}>
          {details.label}
        </span>
      </div>

      <p className="mt-2 font-mono text-lg font-bold tabular-nums text-ink">{formatINR(amountOfNote(note))}</p>

      {note.note?.trim() ? (
        <p className="mt-1.5 line-clamp-2 text-[11px] italic leading-4 text-ink-muted" title={note.note}>
          {note.note}
        </p>
      ) : null}

      <dl className="mt-3 divide-y divide-line/70 overflow-hidden rounded-lg border border-line/70">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{row.label}</dt>
            <dd className={`truncate text-[11px] font-semibold text-ink-soft ${row.mono ? 'font-mono tabular-nums' : ''}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex items-center gap-1 border-t border-line/70 pt-2.5">
        <button
          type="button"
          onClick={() => onEdit(note)}
          title="Edit task"
          aria-label="Edit task"
          className={`${iconButton} text-ink-muted hover:bg-subtle hover:text-ink`}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => onView(note)}
          title="View details"
          aria-label="View details"
          className={`${iconButton} text-ink-muted hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-slate-800 dark:hover:text-brand-400`}
        >
          <Eye size={14} />
        </button>
        <button
          type="button"
          onClick={() => onToggleComplete(note)}
          title={complete ? 'Reopen task' : 'Mark task complete'}
          aria-label={complete ? 'Reopen task' : 'Mark task complete'}
          className={`${iconButton} text-ink-muted hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950 dark:hover:text-emerald-400`}
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(note)}
          title="Delete task"
          aria-label="Delete task"
          className={`${iconButton} text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950 dark:hover:text-rose-400`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
};

/**
 * Collapsible category bucket. Uses the same grid-rows 0fr/1fr technique as the
 * metrics panel so the reveal animates smoothly without a fixed height.
 */
export const TaskBucketAccordion = ({
  label,
  hint,
  accentClass = 'bg-slate-300',
  count = 0,
  total = 0,
  emptyMessage,
  open,
  onToggle,
  children,
}) => (
  <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:focus-visible:ring-brand-400/60"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={`h-8 w-1.5 shrink-0 rounded-full ${accentClass}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-ink">{label}</p>
          <p className="truncate text-[11px] text-ink-muted">{hint}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="rounded-full bg-subtle px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums text-ink-soft">
          {count}
        </span>
        <span className="hidden font-mono text-sm font-semibold tabular-nums text-ink sm:inline">
          {formatINR(total)}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-muted">
          <CalendarDays size={12} className="hidden sm:inline" />
          <ChevronDown size={16} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </span>
      </div>
    </button>

    <div
      className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr] opacity-100 visible' : 'grid-rows-[0fr] opacity-0 invisible'
      }`}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="border-t border-line/70 p-4">
          {count === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong bg-subtle/60 p-5 text-center text-sm text-ink-muted">
              {emptyMessage}
            </p>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  </section>
);
