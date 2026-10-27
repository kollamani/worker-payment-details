// Shared display helpers for transaction rows. Kept UI-only so the backend
// remains the single source of truth for validation and balance calculations.

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_METHOD_LABELS = PAYMENT_METHOD_OPTIONS.reduce((labels, option) => {
  labels[option.value] = option.label;
  return labels;
}, {});

export const formatPaymentMethod = (value) => {
  const key = String(value || '').trim().toLowerCase();
  return PAYMENT_METHOD_LABELS[key] || '—';
};

export const formatTransactionType = (type) =>
  String(type).toLowerCase() === 'withdrawal' ? 'Withdrawal' : 'Deposit';

// Short, human-scannable reference for the immutable Mongo id. The full id is
// kept in the DOM title so support/debugging can still copy it.
export const shortTransactionId = (transaction) => {
  const id = String(transaction?.id || transaction?._id || '');
  return id ? `#${id.slice(-8).toUpperCase()}` : '—';
};

// The ledger has no mutable status column: a withdrawal is money paid out, and
// a deposit stays Active until its 50% pool is fully drawn down. Statuses are
// therefore derived, never trusted from storage.
export const getTransactionStatus = (transaction) => {
  if (String(transaction?.type).toLowerCase() === 'withdrawal') {
    return { key: 'paid', label: 'Paid' };
  }
  const amount = Number(transaction?.amount || 0);
  const remaining =
    transaction?.remainingBalance === null || transaction?.remainingBalance === undefined
      ? amount * 0.5
      : Number(transaction.remainingBalance);
  return remaining > 0.009
    ? { key: 'active', label: 'Active' }
    : { key: 'settled', label: 'Settled' };
};

export const TRANSACTION_STATUS_CLASSES = {
  active:
    'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950/70 dark:text-sky-300 dark:ring-sky-400/30',
  settled:
    'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950/70 dark:text-violet-300 dark:ring-violet-400/30',
  paid:
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/70 dark:text-amber-300 dark:ring-amber-400/30',
};
