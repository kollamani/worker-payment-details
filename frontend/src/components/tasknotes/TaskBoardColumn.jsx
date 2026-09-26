import React from 'react';
import { TaskBoardCard } from './TaskBoardCard';
import { formatINR } from '../../utils/financialMetrics';

/**
 * Horizontal dashboard section: solid colour header banner, a full-width column
 * total row, then a sideways-scrolling strip of task cards. Category sections
 * are stacked vertically by the parent (`flex flex-col`), never side-by-side.
 */
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
  <section className="flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
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
      <div className="flex items-center justify-between rounded-lg bg-subtle px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Column total</span>
        <span className="font-mono text-sm font-bold tabular-nums text-ink">{formatINR(total)}</span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong bg-subtle/60 p-4 text-center text-xs text-ink-muted">
          {emptyMessage}
        </p>
      ) : (
        /* Horizontal card strip: cards sit side-by-side and scroll sideways.
           `-mx-3` + `px-3` lets cards bleed to the section edge while keeping
           the 12px inset at rest; `pb-2` clears a lane for the slim scrollbar.
           Each wrapper div owns width / shrink / snap so TaskBoardCard itself
           stays pixel-identical to the previous design. */
        <div className="board-scroll -mx-3 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-3 pb-2">
          {items.map((note) => (
            <div
              key={note._id}
              className="w-[86%] shrink-0 snap-start sm:w-[46%] lg:w-[31.5%] xl:w-[23.5%]"
            >
              <TaskBoardCard
                note={note}
                onEdit={onEdit}
                onView={onView}
                onDelete={onDelete}
                onToggleComplete={onToggleComplete}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  </section>
);

export default TaskBoardColumn;
