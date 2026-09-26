/*
 * Regex escaping helper - single source of truth for building safe patterns
 * from user-controlled strings (village / worker / admin filters).
 *
 * Interpolating raw input into `new RegExp(...)` is regex injection:
 * an attacker can inject metacharacters (filter bypass) or a nested-quantifier
 * payload such as (a+)+$ that causes catastrophic backtracking (ReDoS) and
 * stalls the whole Node event loop.
 */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Exact, case-insensitive match pattern (anchored + escaped). */
const exactMatchRegex = (value, flags = 'i') => new RegExp(`^${escapeRegex(value)}$`, flags);

module.exports = { escapeRegex, exactMatchRegex };
