import React, { useEffect, useState } from 'react';
import { CalendarDays, Loader2, PlusCircle, Wallet, X } from 'lucide-react';
import { isFutureDateKey, isValidDateKey, todayKey } from '../utils/dates';
import { PAYMENT_METHOD_OPTIONS } from '../utils/transactions';
import { DEFAULT_EXTRA_FEE, loadLastTransaction, saveLastTransaction } from '../utils/lastTransaction';

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const controlClass =
  'w-full rounded-xl border border-line-strong/70 bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

const EMPTY_FORM = {
  type: 'deposit',
  amount: '',
  date: '', // resolved to today's key when nothing stickier exists
  paymentMethod: 'cash',
  extraFee: String(DEFAULT_EXTRA_FEE), // optional fee; user can edit or clear it
  note: '',
};

/**
 * Sticky defaults: if this worker already had a transaction submitted during
 * a previous session, pre-fill every field with those values; otherwise fall
 * back to the plain defaults with today's date.
 */
const buildInitialForm = (memberId) => {
  const previous = loadLastTransaction(memberId);
  if (!previous) return { ...EMPTY_FORM, date: todayKey() };
  return { ...EMPTY_FORM, ...previous, date: previous.date || todayKey() };
};

/**
 * Worker-scoped add-transaction dialog.
 *
 * The worker (`member`) is fixed by the details page and sent automatically by
 * the parent, so this form never allows recording against the wrong worker.
 */
const AddWorkerTransactionModal = ({ open, member, availableBalance = 0, onSubmit, onClose }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset every time the dialog is opened for a possibly different worker,
  // seeding from this worker's most recent submission (sticky defaults).
  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm(member?._id));
    setError('');
    setSubmitting(false);
  }, [open, member?._id]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const workerName = member?.workerName || member?.name || 'this worker';
  const isDeposit = form.type === 'deposit';

  const updateField = (event) => {
    const { name, value } = event.target;
    setError('');
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const amount = Number.parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }
    if (!['deposit', 'withdrawal'].includes(form.type)) {
      setError('Please choose a valid transaction type.');
      return;
    }
    if (!isValidDateKey(form.date)) {
      setError('Please select a valid transaction date.');
      return;
    }
    if (isFutureDateKey(form.date)) {
      setError('Transaction date cannot be in the future.');
      return;
    }
    if (!PAYMENT_METHOD_OPTIONS.some((option) => option.value === form.paymentMethod)) {
      setError('Please choose a valid payment method.');
      return;
    }
    // Optional fee: an empty field means "no fee" (recorded as 0). Otherwise
    // it must cast to a non-negative number before it reaches the API.
    const feeInput = String(form.extraFee).trim();
    const extraFee = feeInput === '' ? 0 : Number(feeInput);
    if (!Number.isFinite(extraFee) || extraFee < 0) {
      setError('Fee amount must be zero or a positive number.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        member: member._id,
        date: form.date,
        type: form.type,
        amount,
        extraFee,
        paymentMethod: form.paymentMethod,
        note: form.note.trim(),
        villageName: member?.villageName || '',
      });
      // Persist the submitted values so the next "Add transaction" for this
      // worker opens pre-filled (sticky defaults).
      saveLastTransaction(member._id, form);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to record the transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-worker-transaction-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="mx-auto my-4 w-full max-w-xl animate-modal-pop overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line/70 bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-4 text-white sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
              {workerName}
              {member?.jNo ? ` · ${member.jNo}` : ''}
            </p>
            <h2 id="add-worker-transaction-title" className="mt-1 text-lg font-semibold tracking-tight">
              Add transaction
            </h2>
            <p className="mt-1 text-sm text-white/85">
              Recorded against this worker automatically — no worker selection needed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close add transaction dialog"
            className="rounded-full bg-white/15 p-2 text-white transition-colors hover:bg-white/25 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          <fieldset>
            <legend className={labelClass}>Transaction type</legend>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  isDeposit
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200'
                    : 'border-line-strong bg-surface text-ink-soft hover:bg-subtle'
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value="deposit"
                  checked={isDeposit}
                  onChange={updateField}
                  className="h-4 w-4 accent-emerald-600"
                />
                <Wallet size={16} aria-hidden="true" /> Deposit
              </label>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  !isDeposit
                    ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200'
                    : 'border-line-strong bg-surface text-ink-soft hover:bg-subtle'
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value="withdrawal"
                  checked={!isDeposit}
                  onChange={updateField}
                  className="h-4 w-4 accent-amber-600"
                />
                <PlusCircle size={16} aria-hidden="true" /> Withdrawal / Paid
              </label>
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="add-tx-amount" className={labelClass}>
                Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                id="add-tx-amount"
                type="number"
                name="amount"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={updateField}
                placeholder="0.00"
                required
                autoFocus
                className={`${controlClass} font-mono tabular-nums`}
              />
              {isDeposit && Number(form.amount) > 0 && (
                <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                  {formatMoney(Number(form.amount) * 0.5)} becomes the available 50% deposit balance.
                </p>
              )}
              {!isDeposit && (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  Available pool: {formatMoney(availableBalance)}. The API validates the real balance.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="add-tx-date" className={labelClass}>
                Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <CalendarDays
                  size={15}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                />
                <input
                  id="add-tx-date"
                  type="date"
                  name="date"
                  value={form.date}
                  max={todayKey()}
                  onChange={updateField}
                  required
                  className={`${controlClass} pl-9`}
                />
              </div>
              <p className="mt-1 text-[11px] text-ink-muted">
                Sticks to your last used date, or today ({todayKey()}) on first use.
              </p>
            </div>

            <div>
              <label htmlFor="add-tx-payment-method" className={labelClass}>
                Payment method
              </label>
              <select
                id="add-tx-payment-method"
                name="paymentMethod"
                value={form.paymentMethod}
                onChange={updateField}
                className={controlClass}
              >
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-ink-muted">Pre-filled from your last transaction.</p>
            </div>

            <div>
              <label htmlFor="add-tx-extra-fee" className={labelClass}>
                Fee amount (₹)
              </label>
              <input
                id="add-tx-extra-fee"
                type="number"
                name="extraFee"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.extraFee}
                onChange={updateField}
                placeholder="Optional — e.g. 100"
                className={`${controlClass} font-mono tabular-nums`}
              />
              <p className="mt-1 text-[11px] text-ink-muted">
                Optional. Defaults to ₹{DEFAULT_EXTRA_FEE} — change it or clear it for no fee.
              </p>
            </div>

            <div className="sm:col-span-2">
              <span className={labelClass}>Status</span>
              <div className="flex min-h-[42px] items-center gap-2 rounded-xl border border-line bg-subtle/60 px-3 py-2.5 text-sm text-ink-soft">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${isDeposit ? 'bg-sky-500' : 'bg-amber-500'}`}
                />
                {isDeposit ? 'Active after recording' : 'Paid after recording'}
              </div>
              <p className="mt-1 text-[11px] text-ink-muted">Status is derived from the ledger.</p>
            </div>
          </div>

          <div>
            <label htmlFor="add-tx-note" className={labelClass}>
              Remarks / description
            </label>
            <textarea
              id="add-tx-note"
              name="note"
              rows={2}
              maxLength={500}
              value={form.note}
              onChange={updateField}
              placeholder="Optional note for this transaction"
              className={`${controlClass} resize-none`}
            />
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-line/70 bg-subtle/40 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-line-strong px-4 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:from-brand-500 hover:to-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <PlusCircle size={16} aria-hidden="true" />}
            {submitting ? 'Saving…' : 'Add transaction'}
          </button>
        </footer>
      </form>
    </div>
  );
};

export default AddWorkerTransactionModal;
