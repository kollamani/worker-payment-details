const getOriginalEnteredAmount = (transaction) =>
  Number(transaction.originalEnteredAmount ?? transaction.originalAmount ?? transaction.amount ?? 0);

const getEffectiveDepositBalance = (transaction) =>
  Number(transaction.effectiveDepositBalance ?? getOriginalEnteredAmount(transaction) * 0.5);

const getRemainingDepositBalance = (transaction) =>
  transaction.effectiveDepositBalance === undefined && transaction.remainingBalance !== undefined
    ? Math.min(Number(transaction.remainingBalance), getEffectiveDepositBalance(transaction))
    : Number(transaction.remainingBalance ?? getEffectiveDepositBalance(transaction));

// ---------------------------------------------------------------------------
// Date helpers
//
// Convention: a transaction's calendar date is stored as UTC midnight of the
// intended day ('2026-09-18' -> 2026-09-18T00:00:00.000Z). Every day key is
// therefore derived with UTC getters, so the calendar day can never shift with
// the server's timezone (the classic `new Date('2026-09-18')` + local-getters
// off-by-one bug is impossible by construction).
// ---------------------------------------------------------------------------

const pad2 = (value) => String(value).padStart(2, '0');

/** Server-local 'YYYY-MM-DD' for the current day (request-date fallback). */
const serverTodayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

/**
 * Converts any supported date input ('YYYY-MM-DD', full ISO string, or Date)
 * into a canonical UTC-midnight Date for the intended calendar day.
 * Returns null for missing values and rejects impossible calendar dates
 * (e.g. '2026-02-31') that would otherwise roll over silently.
 */
const toUtcMidnight = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
};

/** 'YYYY-MM-DD' day key for a stored date — always derived with UTC getters. */
const toDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
};

/**
 * Money comparisons tolerate float residue from 50% splits. For rupee-scale
 * values the double-precision residue is ~1e-12, so a 1e-6 threshold forgives
 * rounding dust while never forgiving a real shortfall (>= half a paisa).
 */
const WITHDRAWAL_EPSILON = 0.000001;

/**
 * Plans a FIFO withdrawal allocation across the given deposits. The deposits
 * must already be ordered oldest-first and pre-filtered to the eligible window
 * (all deposits dated up to and including the withdrawal's date).
 *
 * Returns { plan, shortfall }:
 *  - plan:     [{ id, deduction }] — the per-deposit amounts to deduct.
 *  - shortfall: the uncovered remainder (0 when the deposits fully cover the
 *    requested amount; float residue is tolerated within WITHDRAWAL_EPSILON).
 */
const planWithdrawalAllocation = (deposits, withdrawalAmount, epsilon = WITHDRAWAL_EPSILON) => {
  let remainingToDeduct = Number(withdrawalAmount) || 0;
  const plan = [];
  for (const deposit of deposits) {
    if (remainingToDeduct <= epsilon) {
      remainingToDeduct = 0;
      break;
    }
    const pool = Number(deposit.remainingBalance) || 0;
    const deduction = Math.min(remainingToDeduct, pool);
    if (deduction <= 0) continue;
    plan.push({ id: deposit._id, deduction });
    remainingToDeduct -= deduction;
  }
  return { plan, shortfall: remainingToDeduct > epsilon ? remainingToDeduct : 0 };
};

module.exports = {
  getOriginalEnteredAmount,
  getEffectiveDepositBalance,
  getRemainingDepositBalance,
  serverTodayKey,
  toUtcMidnight,
  toDateKey,
  WITHDRAWAL_EPSILON,
  planWithdrawalAllocation,
};
