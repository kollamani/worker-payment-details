import React from 'react';
import { AlertCircle, LoaderCircle, X } from 'lucide-react';
import { CATEGORY_FORM_OPTIONS, DEFAULT_CATEGORY } from '../../utils/taskCategories';

const inputBox =
  'w-full rounded-xl border border-line/80 bg-surface/90 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none disabled:opacity-60';

// The overlay styles live on the CONTAINER itself and the panel is a plain
// child of it. An earlier revision rendered a separate `absolute z-10` backdrop
// sibling next to a `relative` (z-index: auto) <form>; CSS paints positive
// z-index positioned descendants last, so that backdrop covered the whole form
// and the modal rendered as an empty, blurred, non-interactive screen.
const overlay =
  'fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-md dark:bg-black/60 animate-fade-in';
const panel =
  'relative w-full max-w-md rounded-2xl border border-line/80 bg-surface/95 px-6 py-5 shadow-2xl sm:p-8';

/**
 * Coerces a possibly-missing field into a string so every input stays a
 * CONTROLLED component. `undefined`/`null` would otherwise flip an input from
 * controlled to uncontrolled (React warning) and render an empty field.
 */
const readField = (source, key) => {
  const value = source?.[key];
  return value === null || value === undefined ? '' : value;
};

/**
 * Edit modal. The form state and submit handler live in the page, exactly as
 * before — this component only renders them with a premium SaaS design system
 * (Linear / Notion / Stripe inspired).
 *
 * Props
 *   form      the draft ({ description, note, presentAmount, category })
 *   error     optional inline error string (validation / API failures)
 *   saving    disables the fields + Save while the PUT is in flight
 *   onSubmit  receives the REAL DOM submit event so the page can
 *             `preventDefault()` it. Forwarding the draft object instead was
 *             the second half of the "empty screen" bug.
 */
const EditTaskNoteModal = ({
  form,
  onChange,
  onCategoryChange,
  onSubmit,
  onCancel,
  error = '',
  saving = false,
}) => {
  // Defensive: the page gates on `editingNote`, but a partial/missing draft
  // must still render a usable (if empty) form instead of crashing.
  const description = readField(form, 'description');
  const note = readField(form, 'note');
  const presentAmount = readField(form, 'presentAmount');
  const category = form?.category || DEFAULT_CATEGORY;

  // Fallback UI: no draft at all -> tell the user instead of showing a void.
  if (!form) {
    return (
      <div
        className={overlay}
        onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-task-note-title"
      >
        <div className={panel} role="alert">
          <h3 id="edit-task-note-title" className="text-lg font-semibold tracking-tight text-ink">
            Task unavailable
          </h3>
          <p className="mt-2 flex items-start gap-2 text-sm text-ink-soft">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
            This task could not be loaded for editing. Close this dialog and try again.
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-4 py-2 text-sm font-medium text-ink-soft transition-all hover:bg-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:focus-visible:ring-brand-400/60"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = (event) => {
    // `preventDefault()` MUST be called on the real DOM event, otherwise the
    // browser falls back to a native form submission and reloads the SPA.
    event.preventDefault();
    event.stopPropagation();
    if (saving) return;
    onSubmit(event);
  };

  return (
    <div
      className={overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-task-note-title"
    >
      <form onSubmit={handleSubmit} className={panel} noValidate>
        <div className="mb-6 flex items-center justify-between">
          <h3 id="edit-task-note-title" className="text-xl font-semibold tracking-tight text-ink">
            Edit Task Note
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg p-1.5 transition-colors hover:bg-subtle hover:text-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-60 dark:focus-visible:ring-brand-400/60"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <input
            value={description}
            onChange={(event) => onChange('description', event.target.value)}
            disabled={saving}
            className={inputBox}
            placeholder="Task description"
            aria-label="Task description"
          />
          <select
            value={category}
            onChange={(event) => onCategoryChange(event.target.value)}
            disabled={saving}
            aria-label="Task category"
            title="Task category"
            className={`${inputBox} appearance-none pr-9`}
          >
            {CATEGORY_FORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.formLabel}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(event) => onChange('note', event.target.value)}
            disabled={saving}
            className={`${inputBox} resize-y`}
            placeholder="Add extra notes or instructions here (optional)..."
            rows={3}
            maxLength={2000}
            aria-label="Task notes"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={presentAmount}
            onChange={(event) => onChange('presentAmount', event.target.value)}
            disabled={saving}
            className={inputBox}
            placeholder="0.00"
            aria-label="Present amount"
          />
        </div>

        {/* Inline error surface: the page-level banner sits behind this overlay,
            so validation / API failures have to render in here. */}
        {error ? (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}

        <div
          className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-line/80"
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-ink-soft transition-all hover:bg-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-60 dark:focus-visible:ring-brand-400/60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-medium text-white bg-blue-600 shadow-sm hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
            ) : null}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditTaskNoteModal;
