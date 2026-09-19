import React, { useState, useEffect } from 'react';
import { X, UserRound, ShieldCheck, Hash, MapPin, Phone, StickyNote, Loader2, AlertCircle } from 'lucide-react';

/**
 * Canonical form shape after rename:
 *   workerName (was Member Name / `name`)
 *   admin      (was Worker Name / `createdByWorker`)
 */
const emptyForm = { jNo: '', workerName: '', admin: '', villageName: '', phone: '', notes: '' };

// Accepts both canonical and legacy initial data (API returns both during migration).
const normalizeInitial = (initialData = {}) => ({
  jNo: initialData.jNo || '',
  workerName: initialData.workerName ?? initialData.name ?? '',
  admin: initialData.admin ?? initialData.createdByWorker ?? '',
  villageName: initialData.villageName || '',
  phone: initialData.phone || '',
  notes: initialData.notes || '',
});

const validate = (form) => {
  const errors = {};
  if (!form.jNo.trim()) errors.jNo = 'J.No is required (e.g. J-101).';
  if (!form.workerName.trim()) errors.workerName = 'Worker name is required.';
  else if (form.workerName.trim().length < 2) errors.workerName = 'Worker name must be at least 2 characters.';
  if (!form.admin.trim()) errors.admin = 'Admin name is required.';
  else if (form.admin.trim().length < 2) errors.admin = 'Admin name must be at least 2 characters.';
  if (form.phone.trim() && !/^[+\d][\d\s-]{6,14}$/.test(form.phone.trim()))
    errors.phone = 'Enter a valid phone number.';
  return errors;
};

const baseInput =
  'w-full rounded-xl border bg-white px-3.5 py-2.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-all duration-150 hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';
const okInput = 'border-slate-300';
const errInput = 'border-red-400 focus:border-red-500 focus:ring-red-500/15';

const Field = ({ id, label, required, optional, icon: Icon, error, hint, children }) => (
  <div>
    <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-slate-700">
      <span>
        {label}
        {required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
      </span>
      {optional && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">optional</span>
      )}
    </label>
    <div className="relative">
      {Icon && (
        <Icon size={16} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${error ? 'text-red-400' : 'text-slate-400'}`} />
      )}
      {children}
    </div>
    {error ? (
      <p role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
        <AlertCircle size={13} className="shrink-0" /> {error}
      </p>
    ) : hint ? (
      <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
    ) : null}
  </div>
);

const MemberForm = ({ open, initialData, onSubmit, onClose }) => {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(initialData);

  useEffect(() => {
    if (open) {
      setForm(initialData ? normalizeInitial(initialData) : emptyForm);
      setErrors({});
      setServerError('');
      setTouched({});
    }
  }, [initialData, open]);

  if (!open) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...form, [name]: value };
    setForm(next);
    setServerError('');
    if (touched[name]) setErrors(validate(next));
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors(validate(form));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    setTouched({ jNo: true, workerName: true, admin: true, phone: true });
    setServerError('');
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      const workerName = form.workerName.trim();
      const admin = form.admin.trim();
      await onSubmit({
        jNo: form.jNo.trim(),
        workerName,
        name: workerName,
        admin,
        createdByWorker: admin,
        villageName: form.villageName.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim(),
      });
    } catch (err) {
      setServerError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputFor = (name) => `${baseInput} ${errors[name] && touched[name] ? errInput : okInput}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
      role="dialog" aria-modal="true" aria-labelledby="member-form-title"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 bg-gradient-to-r from-brand-900 via-brand-700 to-brand-600 px-6 pb-5 pt-6 text-white">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
              {isEditing ? 'Edit record' : 'New record'}
            </p>
            <h3 id="member-form-title" className="mt-1 text-xl font-semibold tracking-tight">
              {isEditing ? 'Edit Worker' : 'Add New Worker'}
            </h3>
            <p className="mt-1 text-sm text-white/80">Register a worker with admin and village details.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close form"
            className="rounded-lg bg-white/15 p-1.5 text-white ring-1 ring-inset ring-white/25 hover:bg-white/25 disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4 px-6 py-6">
          {serverError && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{serverError}</span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="member-jNo" label="J.No" required icon={Hash} error={touched.jNo ? errors.jNo : ''}>
              <input id="member-jNo" name="jNo" value={form.jNo} onChange={handleChange} onBlur={handleBlur}
                disabled={saving} autoComplete="off" className={inputFor('jNo')} placeholder="e.g. J-101" />
            </Field>
            <Field id="member-workerName" label="Worker Name" required icon={UserRound}
              error={touched.workerName ? errors.workerName : ''} hint="Full name of the worker">
              <input id="member-workerName" name="workerName" value={form.workerName} onChange={handleChange} onBlur={handleBlur}
                disabled={saving} autoComplete="name" className={inputFor('workerName')} placeholder="e.g. Ravi Kumar" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="member-admin" label="Admin" required icon={ShieldCheck}
              error={touched.admin ? errors.admin : ''} hint="Manages this worker">
              <input id="member-admin" name="admin" value={form.admin} onChange={handleChange} onBlur={handleBlur}
                disabled={saving} autoComplete="off" className={inputFor('admin')} placeholder="Enter admin name" />
            </Field>
            <Field id="member-village" label="Village" optional icon={MapPin} error="">
              <input id="member-village" name="villageName" value={form.villageName} onChange={handleChange}
                disabled={saving} autoComplete="off" className={inputFor('villageName')} placeholder="e.g. Village A" />
            </Field>
          </div>
          <Field id="member-phone" label="Phone" optional icon={Phone} error={touched.phone ? errors.phone : ''}>
            <input id="member-phone" name="phone" type="tel" value={form.phone} onChange={handleChange} onBlur={handleBlur}
              disabled={saving} autoComplete="tel" className={`${inputFor('phone')} font-mono tabular-nums`} placeholder="+91 98765 43210" />
          </Field>
          <div>
            <label htmlFor="member-notes" className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-slate-700">
              <span>Notes</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">optional</span>
            </label>
            <div className="relative">
              <StickyNote size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
              <textarea id="member-notes" name="notes" value={form.notes} onChange={handleChange} disabled={saving}
                rows={2} className={`${inputFor('notes')} resize-none !pl-10`} placeholder="Any remarks about this worker…" />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/25 hover:bg-brand-700 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-brand-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'Saving…' : isEditing ? 'Update Worker' : 'Add Worker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MemberForm;
