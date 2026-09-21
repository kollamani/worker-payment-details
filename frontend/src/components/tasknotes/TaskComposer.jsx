import React from 'react';
import { ArrowRight, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { CATEGORY_FORM_OPTIONS, DEFAULT_CATEGORY } from '../../utils/taskCategories';
import { formatINR } from '../../utils/financialMetrics';

const fieldLabel = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const fieldBox =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

/**
 * "Add task notes" composer. Purely presentational — every value and handler
 * comes from the page, so the existing row/save logic is untouched.
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
  <form onSubmit={onSubmit} className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-slate-900">Add task notes</h2>
        <p className="mt-0.5 text-xs text-slate-500">Create one or more tasks. Pick a category and enter the amount.</p>
      </div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">Quick entry</span>
    </div>

    <div className="space-y-4 bg-slate-50/60 p-4 sm:p-6">
      {rows.map((row, index) => (
        <div key={row.localId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                </div>
              </label>

              <label className="block">
                <span className={fieldLabel}>Amount</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-semibold text-slate-400">
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
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => onRemoveRow(index)}
                title="Remove this task row"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 size={13} /> Remove row
              </button>
            </div>
          )}
        </div>
      ))}
    </div>

    <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAddRow}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
        >
          <Plus size={16} /> Add Task Note
        </button>
        <button
          type="button"
          onClick={onViewEntry}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          View Entry <ArrowRight size={15} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-600">
          Total amount:{' '}
          <strong className="font-mono font-semibold tabular-nums text-slate-900">{formatINR(total)}</strong>
        </span>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Task Notes'}
        </button>
      </div>
    </div>
  </form>
);

export default TaskComposer;
