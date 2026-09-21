import React from 'react';
import { TaskBoardCard } from './TaskBoardCard';
import { formatINR } from '../../utils/financialMetrics';

/** Board column: solid colour header banner, column total, then task cards. */
const TaskBoardColumn = ({
  title,
  subtitle,
  headerClass,
  icon: Icon,
  items = [],
  total = 0,
  emptyMessage,
  onEdit,
  onView,
  onDelete,
  onToggleComplete,
}) => (
  <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className={`flex items-center justify-between gap-3 px-4 py-3 text-white ${headerClass}`}>
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? <Icon size={17} className="shrink-0 opacity-90" /> : null}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold tracking-tight">{title}</h3>
          <p className="truncate text-[11px] text-white/75">{subtitle}</p>
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums">
        {items.length}
      </span>
    </header>

    <div className="flex flex-1 flex-col gap-3 p-3">
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Column total</span>
        <span className="font-mono text-sm font-bold tabular-nums text-slate-900">{formatINR(total)}</span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-center text-xs text-slate-500">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid gap-3">
          {items.map((note) => (
            <TaskBoardCard
              key={note._id}
              note={note}
              onEdit={onEdit}
              onView={onView}
              onDelete={onDelete}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </div>
      )}
    </div>
  </section>
);

export default TaskBoardColumn;
