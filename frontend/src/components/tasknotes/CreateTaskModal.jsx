import React, { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { CATEGORY_FORM_OPTIONS, DEFAULT_CATEGORY } from '../../utils/taskCategories';
import { formatINR } from '../../utils/financialMetrics';

const fieldLabel = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const fieldBox =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

// Fresh draft for every open; the factory avoids sharing one mutable object.
const createEmptyForm = () => ({
  description: '',
  note: '',
  category: DEFAULT_CATEGORY,
  presentAmount: '',
});

export default function CreateTaskModal({ open, onClose, onSubmit }) {
  const dialogId = useId();
  const [form, setForm] = useState(createEmptyForm);
  const [submitting, setSubmitting] = useState(false);

  const updateField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
  const resetForm = () => setForm(createEmptyForm());

  // Every close path (X, Cancel, backdrop, Esc) clears the draft first, so the
  // next open always starts from a clean form.
  const handleClose = () => {
    resetForm();
    setSubmitting(false);
    onClose();
  };

  // Esc closes the dialog while it is open.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // handleClose only touches local draft state, so `open` is the real dep.
  }, [open]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      // The page owns the API call; true = created (reset + parent closes),
      // false = validation or server failure (stay open, keep the draft).
      const succeeded = await onSubmit({ ...form });
      if (succeeded) resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dialogId}-title`}
      aria-describedby={`${dialogId}-desc`}
    >
      <form
        id={`${dialogId}-form`}
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
        autoComplete="off"
      >
        <div className="mb-4 flex items-center justify-between">
          <div id={`${dialogId}-title`}>
            <h3 className="text-lg font-semibold tracking-tight text-slate-900">Create Task Note</h3>
            <p
              id={`${dialogId}-desc`}
              className="mt-0.5 text-xs text-slate-500"
            >
              Add a task with a category and amount. The summary cards update as soon as it is saved.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <label>
            <span className={fieldLabel}>Task description</span>
            <input
              name="description"
              value={form.description}
              onChange={(event) => updateField('description', event.target.value)}
              className={fieldBox}
              placeholder="Task description"
              aria-label="Task description"
              autoFocus
            />
          </label>

          <label>
            <span className={fieldLabel}>Note (optional)</span>
            <textarea
              name="note"
              className={`${fieldBox} resize-y`}
              placeholder="Add note notes or instructions here (optional)..."
              rows={3}
              maxLength={2000}
              aria-label="Task note (optional)"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={fieldLabel}>Category</span>
              <div className="relative">
                <select
                  name="category"
                  value={form.category}
                  onChange={(event) => updateField('category', event.target.value)}
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
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </label>

            <label>
              <span className={fieldLabel}>Amount</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-semibold text-slate-400">
                  ₹
                </span>
                <input
                  name="presentAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.presentAmount}
                  onChange={(event) => updateField('presentAmount', event.target.value)}
                  className={`${fieldBox} pl-8 text-right font-mono font-semibold tabular-nums`}
                  placeholder="0.00"
                  aria-label="Amount"
                />
              </div>
            </label>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <span className="mr-auto text-xs font-medium text-slate-500">
            Total amount:{' '}
            <span className="font-mono font-semibold tabular-nums text-slate-900">
              {formatINR(form.presentAmount)}
            </span>
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving...' : 'Add Task'}
          </button>
        </div>
      </form>
    </div>
  );
}
