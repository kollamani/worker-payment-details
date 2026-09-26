/*
 * Input-shape validation helpers (NoSQL-injection defence).
 *
 * Express' default query/body parser turns `?type[$ne]=deposit` into
 * `{ type: { '$ne': 'deposit' } }`. Passed straight into a Mongoose filter
 * that object becomes a QUERY OPERATOR ($ne / $regex / $gt ...), i.e. classic
 * NoSQL injection: the attacker rewrites the filter the server runs.
 *
 * Every controller that copies request values into a Mongoose filter must
 * first call rejectNestedValues() so only scalars (string/number/boolean)
 * ever reach the database layer.
 */

const SCALAR_TYPES = new Set(['string', 'number', 'boolean']);

const isScalar = (value) =>
  value === null || value === undefined || SCALAR_TYPES.has(typeof value);

/**
 * Throws a 400 when any value in `source` (req.query / req.body) is an
 * object or array (i.e. an injected operator such as { $ne: ... }).
 * Pass the raw object - it is inspected, never mutated.
 */
const rejectNestedValues = (source, label = 'request') => {
  if (!source || typeof source !== 'object') return;
  for (const [key, value] of Object.entries(source)) {
    if (!isScalar(value)) {
      const err = new Error(`Invalid "${key}" in ${label}: only simple values are allowed`);
      err.statusCode = 400;
      throw err;
    }
  }
};

/** True when the value is a single, plain scalar (not array/object). */
const isScalarValue = (value) => SCALAR_TYPES.has(typeof value);

module.exports = { rejectNestedValues, isScalar, isScalarValue };
