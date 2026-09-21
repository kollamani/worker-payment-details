// Calculated financial-breakdown metrics for the Task Notes dashboard.
//
// Pure, dependency-free and null-safe: every bucket is coerced through
// `safeAmount()`, so a missing / null / undefined amount (or a partial summary
// payload from an older deployment) degrades to 0 instead of leaking `NaN`
// into the rendered UI.
//
// Buckets, exactly as the rest of the app defines them:
//   - Present Having   = PRESENT_HAVING tasks           (money currently held)
//   - Present Expense  = every COMPLETED task           (the completed expense bucket)
//   - Expected Income  = pending (open) EXPECTED_INCOME tasks
//   - Expected Expense = pending (open) EXPECTED_EXPENSE tasks
//
// Formulas (business spec):
//   1. Having Savings         = Present Having - Expected Expense - Present Expense
//   2. Overall Income         = Present Having + Expected Income
//   3. Entire Expense         = Expected Expense + Present Expense
//   4. Total Expected Savings = Overall Income - Entire Expense
//
// This module mirrors `buildTaskSummary()` in the backend
// (backend/controllers/taskNoteController.js) one-to-one, so the API payload
// and the client-side selector can never drift apart.

import { amountOfNote, normalizeCategory } from './taskCategories.js';

/** Coerces any value to a finite number, falling back to 0. */
export const safeAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

// Order the four calculated metrics are rendered in.
export const FINANCIAL_METRIC_KEYS = [
  'havingSavings',
  'overallIncome',
  'entireExpense',
  'totalExpectedSavings',
];

/**
 * Resolves the four raw buckets from either the API summary payload
 * (`totalExpense` / `totalExpectedIncome` / ...) or the local mirror computed
 * in TaskNotes.jsx. Falls back defensively so a partial payload still resolves.
 */
export const resolveSummaryBuckets = (summary = {}) => {
  const source = summary && typeof summary === 'object' ? summary : {};
  return {
    // `presentIncome` is the PRESENT_HAVING bucket. Older payloads only carried
    // the already-netted `totalPresentHaving`, which is the closest fallback.
    presentHaving: source.presentIncome ?? source.totalPresentHaving,
    presentExpense: source.totalExpense ?? source.presentExpense,
    expectedIncome: source.totalExpectedIncome ?? source.expectedIncome,
    expectedExpense: source.totalExpectedExpense ?? source.expectedExpense,
  };
};

/** Category family predicate: any of the raw keys that mean "expense" today.
 *
 * The task-creation form accepts "Expense" (and the category normalizer maps to
 * the same family), so the Spend Expense bucket needs to include those rows
 * right away — otherwise a freshly created expense task sits in the bottom
 * list without being counted. `isCompletedNote` is intentionally **not** used
 * here; expense-family rows are counted from the moment they exist, completed
 * or not.
 */
export const isExpenseFamilyCategory = (category) => {
  // normalizeCategory() resolves every spelling — "Expense", "EXPENSE",
  // "Present Expense", "PRESENT_EXPENSE" — to the canonical uppercase key, so
  // compare against uppercase values and tolerate a missing category safely.
  const normalized = String(normalizeCategory(category) || '').trim().toUpperCase();
  return ['EXPENSE', 'PRESENT_EXPENSE'].includes(normalized);
};

/**
 * Derives the four calculated metrics (plus the resolved buckets) from any
 * summary object. Always returns finite numbers — never `NaN`/`undefined`.
 */
export const deriveFinancialMetrics = (summary = {}) => {
  const buckets = resolveSummaryBuckets(summary);

  const presentHaving = safeAmount(buckets.presentHaving);
  const presentExpense = safeAmount(buckets.presentExpense);
  const expectedIncome = safeAmount(buckets.expectedIncome);
  const expectedExpense = safeAmount(buckets.expectedExpense);

  // 1. Having Savings — what is still left of the present balance.
  const havingSavings = presentHaving - expectedExpense - presentExpense;
  // 2. Overall Income — money held plus everything still expected in.
  const overallIncome = presentHaving + expectedIncome;
  // 3. Entire Expense — expected outgoings plus already-filed expenses.
  const entireExpense = expectedExpense + presentExpense;
  // 4. Total Expected Savings — projected balance once everything settles.
  const totalExpectedSavings = overallIncome - entireExpense;

  return {
    presentHaving,
    presentExpense,
    expectedIncome,
    expectedExpense,
    havingSavings,
    overallIncome,
    entireExpense,
    totalExpectedSavings,
  };
};

// ---------------------------------------------------------------------------
// "Futures" projection — the collapsible card grid on the Task Notes page.
//
//   Current Savings  = Present Saving bucket  (PRESENT_HAVING tasks)
//   Spend Expense    = Present Expense bucket (completed tasks)
//   Planned Income   = Expected Income bucket (pending EXPECTED_INCOME)
//   Planned Expense  = Expected Expense bucket (pending EXPECTED_EXPENSE)
//
//   Overall Income           = Current Savings + Planned Income
//   Overall Expense          = Spend Expense + Planned Expense
//   Overall Expected Savings = Overall Income - Overall Expense
//
// The three projections are intentionally identical to overallIncome /
// entireExpense / totalExpectedSavings above — same ledger, same math — so the
// Futures cards can never disagree with the calculated breakdown.
// ---------------------------------------------------------------------------
export const FUTURES_CARD_KEYS = ['overallIncome', 'overallExpense', 'overallExpectedSavings'];

/**
 * Derives the four always-visible bucket cards and the three Futures
 * projections from any summary object. Every value is coerced through
 * `safeAmount()`, so an empty ledger (or a partial payload) renders `0` —
 * never NaN, never undefined.
 */
export const deriveFuturesMetrics = (summary = {}, notes = []) => {
  const buckets = resolveSummaryBuckets(summary);

  const currentSavings = safeAmount(buckets.presentHaving);
  const plannedIncome = safeAmount(buckets.expectedIncome);
  const plannedExpense = safeAmount(buckets.expectedExpense);

  // Spend Expense is the expense-family bucket total. The backend's API summary
  // already counts completed expenses into `totalExpense`, but the frontend must
  // count **any** expense-family row — including freshly created ones — so the
  // "Spend Expense" card updates immediately. When a pending `notes` array is
  // supplied (e.g. right after a task is created), its expense rows are folded
  // in on top of the summary snapshot.
  const spendExpenseValues = [
    safeAmount(buckets.presentExpense),
    // `notes` is optional; a missing / non-array value must not throw — fold in
    // the expense-family rows of whatever list was supplied (empty by default).
    ...((Array.isArray(notes) ? notes : []).map((note) =>
      isExpenseFamilyCategory(note?.category) ? amountOfNote(note) : 0
    )),
  ];
  const spendExpense = spendExpenseValues.reduce((sum, value) => sum + safeAmount(value), 0);

  const overallIncome = currentSavings + plannedIncome;
  const overallExpense = spendExpense + plannedExpense;
  const overallExpectedSavings = overallIncome - overallExpense;

  return {
    currentSavings,
    spendExpense,
    plannedIncome,
    plannedExpense,
    overallIncome,
    overallExpense,
    overallExpectedSavings,
  };
};

/** Indian-format currency string (₹1,48,500.00) — 0-safe, never "₹NaN". */
export const formatINR = (value) =>
  `₹${safeAmount(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Percentage of `denominator` that `numerator` represents. A zero / missing /
 * non-numeric denominator resolves to 0 instead of Infinity or NaN.
 */
export const safeRatioPct = (numerator, denominator) => {
  const base = safeAmount(denominator);
  if (base === 0) return 0;
  const pct = (safeAmount(numerator) / base) * 100;
  return Number.isFinite(pct) ? pct : 0;
};

/**
 * Percentage insights backing the hero KPI chips. Each ratio is a real share of
 * the current ledger (never a hardcoded mock value) and is guarded against
 * divide-by-zero, so the chips stay meaningful on an empty workspace.
 */
export const deriveFinancialInsights = (summary = {}) => {
  const metrics = deriveFinancialMetrics(summary);
  return {
    ...metrics,
    // Share of the present balance that is still free to spend.
    savingsRatePct: safeRatioPct(metrics.havingSavings, metrics.presentHaving),
    // Share of overall income that is already in hand.
    inHandSharePct: safeRatioPct(metrics.presentHaving, metrics.overallIncome),
    // Projected net margin once every pending item settles.
    netMarginPct: safeRatioPct(metrics.totalExpectedSavings, metrics.overallIncome),
    // Share of overall income that is still expected in.
    expectedSharePct: safeRatioPct(metrics.expectedIncome, metrics.overallIncome),
  };
};

/**
 * Cumulative running totals of `selector(note)` in chronological order — the
 * data behind the miniature trend sparklines. Always returns at least the
 * starting 0 point, so an empty ledger renders a flat line instead of a blank.
 */
export const buildCumulativeSeries = (notes = [], selector = () => 0) => {
  const list = Array.isArray(notes) ? notes : [];
  const ordered = [...list].sort(
    (a, b) => new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime()
  );
  const series = [0];
  let running = 0;
  ordered.forEach((note) => {
    running += safeAmount(typeof selector === 'function' ? selector(note) : 0);
    series.push(running);
  });
  return series;
};

/**
 * SVG path data for a sparkline drawn inside a width x height box. Flat series
 * (one point, or every point equal) are drawn mid-box so the line stays visible.
 */
export const buildSparklineGeometry = (values = [], width = 120, height = 32, padding = 3) => {
  const points = (Array.isArray(values) ? values : []).map(safeAmount);
  if (points.length === 0) return { line: '', area: '' };

  const innerWidth = Math.max(width - padding * 2, 1);
  const innerHeight = Math.max(height - padding * 2, 1);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const coords = points.map((value, index) => {
    const x = padding + (points.length > 1 ? stepX * index : innerWidth / 2);
    const ratio = span === 0 ? 0.5 : (value - min) / span;
    return { x, y: padding + innerHeight - ratio * innerHeight };
  });

  const line = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const baseline = (height - padding).toFixed(2);
  const area = `${line} L${last.x.toFixed(2)},${baseline} L${first.x.toFixed(2)},${baseline} Z`;

  return { line, area };
};

export default deriveFinancialMetrics;
