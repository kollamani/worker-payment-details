// Bulletproof local calendar-date helpers for the transaction workflow.
//
// Never use `new Date().toISOString().slice(0, 10)` for "today": toISOString()
// converts to UTC first, so the returned day can shift by one depending on the
// user's timezone and the time of day. These helpers always operate on the
// LOCAL calendar day and speak the strict 'YYYY-MM-DD' format used by
// <input type="date"> and the transaction API.

const pad2 = (value) => String(value).padStart(2, '0');

/**
 * Formats a Date (or parseable value) as a LOCAL 'YYYY-MM-DD' key.
 * Returns '' for empty/invalid input.
 */
export const toLocalDateKey = (value = new Date()) => {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

/** Today's LOCAL date as 'YYYY-MM-DD' (the default for new transactions). */
export const todayKey = () => toLocalDateKey(new Date());

/**
 * Formats a stored ledger Date as a UTC 'YYYY-MM-DD' key.
 * Transaction dates are persisted as UTC midnight of the intended calendar day,
 * so UTC getters must be used when reading them back (local getters can shift
 * the displayed day in negative UTC offsets).
 */
export const toUtcDateKey = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
};

/** Display helper for stored ledger dates (UTC calendar day, en-IN). */
export const formatUtcDateDisplay = (value) => {
  const key = toUtcDateKey(value);
  const parsed = parseDateKey(key);
  if (!parsed) return '—';
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Parses a strict 'YYYY-MM-DD' key into a LOCAL-midnight Date.
 * Returns null for anything malformed, including impossible dates such as
 * '2026-02-31' that would otherwise roll over to the next month.
 */
export const parseDateKey = (key) => {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
};

/** True when the key is a well-formed, real calendar date. */
export const isValidDateKey = (key) => parseDateKey(key) !== null;

/** True when the key represents a day after today (LOCAL comparison). */
export const isFutureDateKey = (key) => {
  const target = parseDateKey(key);
  const today = parseDateKey(todayKey());
  if (!target || !today) return false;
  return target.getTime() > today.getTime();
};