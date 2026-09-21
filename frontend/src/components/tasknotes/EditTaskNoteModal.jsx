import React from 'react';
import { X } from 'lucide-react';
import { CATEGORY_FORM_OPTIONS, DEFAULT_CATEGORY } from '../../utils/taskCategories';

const inputBox =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

/**
 * Edit modal. The form state and submit handler live in the page, exactly as
 * before — this component only renders them.
 */
const EditTaskNoteModal = ({ form, onChange, onCategoryChange, onSubmit, onCancel }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
    <form
      onSubmit={onSubmit}
      className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight text-slate-900">Edit Task Note</h3>
        <button type="button" onClick={onCancel} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="space-y-3">
        <input
          value={form.description}
          onChange={(event) => onChange('description', event.target.value)}
          className={inputBox}
          placeholder="Task description"
          aria-label="Task description"
        />
        <select
          value={form.category || DEFAULT_CATEGORY}
          onChange={(event) => onCategoryChange(event.target.value)}
          aria-label="Task category"
          className={`${inputBox} bg-white`}
        >
          {CATEGORY_FORM_OPTIONS.map((category) => (
            <option key={category.value} value={category.value}>
              {category.formLabel}
            </option>
          ))}
        </select>
        <textarea
          value={form.note}
          onChange={(event) => onChange('note', event.target.value)}
          className={`${inputBox} resize-y`}
          placeholder="Add extra notes or instructions here (optional)..."
          rows={3}
          maxLength={2000}
        />
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.presentAmount}
          onChange={(event) => onChange('presentAmount', event.target.value)}
          className={`${inputBox} text-right font-mono font-semibold tabular-nums`}
          placeholder="Present amount"
          aria-label="Present amount"
        />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md"
        >
          Save
        </button>
      </div>
    </form>
  </div>
);

export default EditTaskNoteModal;
