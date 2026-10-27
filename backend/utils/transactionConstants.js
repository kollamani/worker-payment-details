// Shared transaction domain constants.
//
// Kept in a dependency-free module so both the Mongoose schema and the
// controllers enforce exactly the same allow-list. Adding a new method here is
// enough for validation, persistence, and the UI contract to stay in sync.

const PAYMENT_METHODS = ['cash', 'bank', 'upi', 'cheque', 'card', 'other'];

const DEFAULT_PAYMENT_METHOD = 'cash';

/**
 * Normalizes a client-supplied payment method.
 * Returns `undefined` when the caller omitted the field (so updates can leave
 * the stored value untouched) and `null` when the value is not supported.
 */
const normalizePaymentMethod = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  return PAYMENT_METHODS.includes(normalized) ? normalized : null;
};

module.exports = {
  PAYMENT_METHODS,
  DEFAULT_PAYMENT_METHOD,
  normalizePaymentMethod,
};
