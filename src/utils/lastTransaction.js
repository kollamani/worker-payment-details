// Sticky defaults for transaction entry forms: remembers the most recently
// submitted transaction so the next time a modal or form is opened every
// field is pre-filled (and stays fully editable), instead of being re-typed.
//
// Values are stored in localStorage under a `ledger_` prefixed key (same
// convention as ledger_token / ledger_theme). The scope decides the granularity:
//   • a worker id → per-worker key used by the AddWorkerTransactionModal
//   • a module-wide scope id → single key for the main transaction form
// Every read/write is guarded — storage may be unavailable (private mode,
// disabled cookies) and persisted values may be stale or hand-edited, so they
// are re-validated on the way out and sticky defaults are always best-effort.

import { isValidDateKey } from './dates';
import { PAYMENT_METHOD_OPTIONS } from './transactions';

/** Default for the optional Fee Amount field when nothing was persisted. */
export const DEFAULT_EXTRA_FEE = 100;

/** Scope key for the main (member-agnostic) transaction form. */
export const MAIN_FORM_SCOPE = 'main-transaction-form';

const LAST_TRANSACTION_STORAGE_PREFIX = 'ledger_last_tx_';

const isValidPaymentMethod = (value) =>
  PAYMENT_METHOD_OPTIONS.some((option) => option.value === value);

/**
 * Shape of the form values cached as sticky defaults (matches the payload a
 * form submits, minus member-scoped server fields such as the worker id and
 * the member-derived village name).
 *
 * @typedef {Object} LastTransactionFormValues
 * @property {'deposit'|'withdrawal'} type       Transaction type.
 * @property {string}                amount      Raw string from the number input, e.g. "1200".
 * @property {string}                date        YYYY-MM-DD key of the last submitted date.
 * @property {string}                paymentMethod One of PAYMENT_METHOD_OPTIONS values.
 * @property {string}                extraFee    Raw string; '' means the user cleared the fee.
 * @property {boolean}               [hasExtraFee] Whether the extra-fee toggle was on.
 * @property {string}                note        Free-form remarks (≤ 500 chars).
 */

/**
 * Re-validate a persisted (or freshly submitted) record into a safe shape.
 * Anything missing, corrupt, or out of range falls back to its form default
 * so a bad cache entry can never produce an invalid pre-filled form.
 *
 * @param {unknown} value
 * @returns {LastTransactionFormValues | null}
 */
const sanitizeFormValues = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const type = value.type === 'withdrawal' ? 'withdrawal' : 'deposit';
  const amount = Number(value.amount);
  const fee = Number(value.extraFee);

  return {
    type,
    amount: Number.isFinite(amount) && amount > 0 ? String(amount) : '',
    date: typeof value.date === 'string' && isValidDateKey(value.date) ? value.date : '',
    paymentMethod: isValidPaymentMethod(value.paymentMethod) ? value.paymentMethod : 'cash',
    extraFee:
      Number.isFinite(fee) && fee >= 0
        ? String(fee)
        : String(DEFAULT_EXTRA_FEE),
    hasExtraFee: Boolean(value.hasExtraFee),
    note: typeof value.note === 'string' ? value.note.slice(0, 500) : '',
  };
};

/**
 * @param {string} scope Worker id (per-worker modal) or module scope id
 *   identifying the form the defaults belong to.
 * @returns {LastTransactionFormValues | null} Persisted values, or null on the
 *   very first open / when storage is unavailable / when the record is invalid.
 */
export const loadLastTransaction = (scope) => {
  if (!scope || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_TRANSACTION_STORAGE_PREFIX + scope);
    if (!raw) return null;
    return sanitizeFormValues(JSON.parse(raw));
  } catch {
    return null;
  }
};

/**
 * Persist the submitted values as the next open's sticky defaults.
 * Failures (quota, private mode) are non-fatal by design.
 *
 * @param {string} scope Worker id or module scope id the values belong to.
 * @param {unknown} values Form values exactly as submitted.
 * @returns {void}
 */
export const saveLastTransaction = (scope, values) => {
  const record = sanitizeFormValues(values);
  if (!scope || !record || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LAST_TRANSACTION_STORAGE_PREFIX + scope, JSON.stringify(record));
  } catch {
    /* storage full / disabled — sticky defaults stay best-effort */
  }
};
