import React from 'react';
import { ArrowRight, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { CATEGORY_FORM_OPTIONS, DEFAULT_CATEGORY } from '../../utils/taskCategories';
import { formatINR } from '../../utils/financialMetrics';

// ── Typography & spacing constants ───────────────────────────────────────────
const fieldLabel = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted';
const fieldBox =
  'w-full rounded-xl border border-line/80 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none disabled:opacity-60';

/**
 * "Add task notes" composer. Purely presentational — every value and handler
 * comes from the page, so the existing row/save logic is untouched, but now
 * trimmed to premium SaaS design (Linear / Notion / Stripe inspired).
 */
const TaskComposer = ({
  rows,
  saving,
  total,
  onUpdate,
  onCategoryChange,
  onRemoveRow,
  onAddRow,
  onSubmit,
  onViewEntry,
}) => (
  <form onSubmit={onSubmit} className="mb-8 overflow-hidden rounded-2xl border border-line/80 bg-surface/90 backdrop-filter shadow-2xl sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/70 px-6 py-4 sm:px-6">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-ink">Add task notes</h2>
        <p className="mt-0.5 text-xs text-ink-muted">Create one or more tasks. Pick a category and enter the amount.</p>
      </div>
      <span className="rounded-full bg-subtle px-2.5 py-1 text-[11px] font-semibold text-ink-muted">Quick entry</span>
    </div>

    <div className="space-y-4 bg-subtle/60 p-6 sm:p-8">
      {rows.map((row, index) => (
        <div key={row.localId} className="rounded-xl border border-line/80 bg-surface p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left column — description + optional note */}
            <div className="space-y-3">
              <label className="block">
                <span className={fieldLabel}>Task description</span>
                <input
                  type="text"
                  value={row.description}
                  onChange={(event) => onUpdate(index, 'description', event.target.value)}
                  placeholder="Task description"
                  className={fieldBox}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>Note (optional)</span>
                <textarea
                  value={row.note}
                  onChange={(event) => onUpdate(index, 'note', event.target.value)}
                  placeholder="Add note notes or instructions here (optional)..."
                  rows={3}
                  maxLength={2000}
                  className={`${fieldBox} resize-y`}
                />
              </label>
            </div>

            {/* Right column — category + amount */}
            <div className="space-y-3">
              <label className="block">
                <span className={fieldLabel}>Category</span>
                <div className="relative">
                  <select
                    value={row.category || DEFAULT_CATEGORY}
                    onChange={(event) => onCategoryChange(index, event.target.value)}
                    aria-label="Task category"
                    title="Task category"
                    className={`${fieldBox} appearance-none pr-9 font-medium`}
                  >
                    {CATEGORY_FORM_OPTIONS.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.formLabel}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={15}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint"
                    aria-hidden="true"
                  />
                </div>
              </label>

              <label className="block">
                <span className={fieldLabel}>Amount</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-semibold text-ink-muted">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={row.presentAmount}
                    onChange={(event) => onUpdate(index, 'presentAmount', event.target.value)}
                    placeholder="0.00"
                    className={`${fieldBox} pl-8 text-right font-mono font-semibold tabular-nums`}
                  />
                </div>
              </label>
            </div>
          </div>

          {rows.length > 1 && (
            <div className="mt-3 flex justify-end border-t border-line/70 pt-2">
              <button
                type="button"
                onClick={() => onRemoveRow(index)}
                title="Remove this task row"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950 dark:hover:text-rose-400"
              >
                <Trash2 size={13} /> Remove row
              </button>
            </div>
          )}
        </div>
      ))}
    </div>

    <div
      className="flex flex-col gap-3 border-t border-line/80 bg-surface/90 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAddRow}
          className="inline-flex items-center gap-2 rounded-xl border border-line/80 bg-surface px-3.5 py-2 text-sm font-medium text-ink-soft shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:hover:border-brand-900 dark:hover:bg-slate-800 dark:hover:text-brand-400"
        >
          <Plus size={16} /> Add Task Note
        </button>
        <button
          type="button"
          onClick={onViewEntry}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
        >
          View Entry <ArrowRight size={15} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-soft">
          Total amount:{' '}
          <strong className="font-mono font-semibold tabular-nums text-ink">{formatINR(total)}</strong>
        </span>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl px-5 py-2.5 text-sm font-medium text-white bg-blue-600 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Task Notes'}
        </button>
      </div>
    </div>
  </form>
);

export default TaskComposer;
