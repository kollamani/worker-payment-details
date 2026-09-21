/*
 * Verification for the calculated financial-breakdown metrics
 * (frontend/src/utils/financialMetrics.js).
 *
 * These are the calculated breakdown numbers plus the always-visible bucket
 * cards and the toggleable "Futures" projection grid, so the math + the
 * null/undefined safety net are checked here without needing a browser.
 *
 * Run with: node scripts/verify-financial-metrics.mjs  (from the frontend folder)
 */
import {
  deriveFinancialMetrics,
  deriveFuturesMetrics,
  safeAmount,
  FINANCIAL_METRIC_KEYS,
  formatINR,
  safeRatioPct,
  deriveFinancialInsights,
  buildCumulativeSeries,
  buildSparklineGeometry,
} from '../src/utils/financialMetrics.js';
import {
  normalizeCategory,
  displayGroupKey,
  amountOfNote,
  CATEGORY_FORM_OPTIONS,
} from '../src/utils/taskCategories.js';

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures += 1;
    console.log(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ''}`);
  }
};

const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
const allFinite = (metrics) =>
  FINANCIAL_METRIC_KEYS.every((key) => Number.isFinite(metrics[key]));

// Mirrors the API payload shape returned by buildTaskSummary().
const apiSummary = {
  presentIncome: 1000,
  totalExpense: 200,
  totalExpectedIncome: 500,
  totalExpectedExpense: 300,
  totalPresentHaving: 800,
};

console.log('\n[1] Business-spec formulas');
const base = deriveFinancialMetrics(apiSummary);
check('Having Savings = 1000 - 300 - 200', closeTo(base.havingSavings, 500), `got=${base.havingSavings}`);
check('Overall Income = 1000 + 500', closeTo(base.overallIncome, 1500), `got=${base.overallIncome}`);
check('Entire Expense = 300 + 200', closeTo(base.entireExpense, 500), `got=${base.entireExpense}`);
check(
  'Total Expected Savings = 1500 - 500',
  closeTo(base.totalExpectedSavings, 1000),
  `got=${base.totalExpectedSavings}`
);

console.log('\n[2] Empty / missing buckets resolve to 0 (never NaN)');
check('empty summary object', allFinite(deriveFinancialMetrics({})) && deriveFinancialMetrics({}).havingSavings === 0);
check('no argument at all', allFinite(deriveFinancialMetrics()));
const junk = deriveFinancialMetrics({
  presentIncome: undefined,
  totalExpense: null,
  totalExpectedIncome: 'not-a-number',
  totalExpectedExpense: NaN,
});
check('undefined / null / text / NaN all become 0', allFinite(junk) && junk.havingSavings === 0 && junk.overallIncome === 0, JSON.stringify(junk));
check('non-object summary is tolerated', allFinite(deriveFinancialMetrics('broken')));
check('safeAmount(Infinity) falls back to 0', safeAmount(Infinity) === 0);
check('safeAmount(null) falls back to 0', safeAmount(null) === 0);
check('safeAmount(0) keeps a real zero', safeAmount(0) === 0);

console.log('\n[3] Local-mirror payload (no alias fields) resolves identically');
const mirror = deriveFinancialMetrics({
  totalPresentHaving: 800,
  presentIncome: 1000,
  totalExpense: 200,
  totalExpectedIncome: 500,
  totalExpectedExpense: 300,
});
check(
  'same four numbers as the API payload',
  closeTo(mirror.havingSavings, base.havingSavings) &&
    closeTo(mirror.overallIncome, base.overallIncome) &&
    closeTo(mirror.entireExpense, base.entireExpense) &&
    closeTo(mirror.totalExpectedSavings, base.totalExpectedSavings),
  JSON.stringify(mirror)
);

console.log('\n[4] Completing an expected expense is metric-neutral');
// Expected Expense 300 moves into Present Expense 500 (200 + 300); the savings
// figures must not jump just because a task was filed.
const afterCompletion = deriveFinancialMetrics({
  presentIncome: 1000,
  totalExpense: 500,
  totalExpectedIncome: 500,
  totalExpectedExpense: 0,
});
check('Having Savings unchanged (500)', closeTo(afterCompletion.havingSavings, 500), `got=${afterCompletion.havingSavings}`);
check('Total Expected Savings unchanged (1000)', closeTo(afterCompletion.totalExpectedSavings, 1000), `got=${afterCompletion.totalExpectedSavings}`);
check('Overall Income unchanged (1500)', closeTo(afterCompletion.overallIncome, 1500), `got=${afterCompletion.overallIncome}`);
check('Entire Expense unchanged (500)', closeTo(afterCompletion.entireExpense, 500), `got=${afterCompletion.entireExpense}`);

console.log('\n[5] Overspending surfaces a negative savings balance');
const overspent = deriveFinancialMetrics({
  presentIncome: 100,
  totalExpense: 250,
  totalExpectedIncome: 0,
  totalExpectedExpense: 0,
});
check('Having Savings is negative (-150)', closeTo(overspent.havingSavings, -150), `got=${overspent.havingSavings}`);
check('value stays finite for the red-tone render path', allFinite(overspent));

console.log('\n[6] Currency + ratio formatting (hero card values and chips)');
check('INR groups in the Indian format', formatINR(148500) === '₹1,48,500.00', formatINR(148500));
check('INR always shows 2 decimals', formatINR(0) === '₹0.00' && formatINR(19500) === '₹19,500.00', formatINR(19500));
check('INR never renders NaN', formatINR(undefined) === '₹0.00' && formatINR('abc') === '₹0.00');
check('ratio of 25/100 is 25%', safeRatioPct(25, 100) === 25);
check('ratio with a zero denominator is 0 (no Infinity)', safeRatioPct(25, 0) === 0);
check('ratio with missing inputs is 0', safeRatioPct(undefined, undefined) === 0);

console.log('\n[7] Hero chip ratios derived from the same summary');
const insights = deriveFinancialInsights(apiSummary);
check('savings rate = 500/1000 = 50%', closeTo(insights.savingsRatePct, 50), `got=${insights.savingsRatePct}`);
check('in-hand share = 1000/1500', closeTo(insights.inHandSharePct, (1000 / 1500) * 100), `got=${insights.inHandSharePct}`);
check('net margin = 1000/1500', closeTo(insights.netMarginPct, (1000 / 1500) * 100), `got=${insights.netMarginPct}`);
check('expected share = 500/1500', closeTo(insights.expectedSharePct, (500 / 1500) * 100), `got=${insights.expectedSharePct}`);
const emptyInsights = deriveFinancialInsights({});
check(
  'every chip is a finite 0 on an empty ledger',
  ['savingsRatePct', 'inHandSharePct', 'netMarginPct', 'expectedSharePct'].every((key) => emptyInsights[key] === 0),
  JSON.stringify(emptyInsights)
);
check('expectedIncome alias feeds the Total Expected Income card', insights.expectedIncome === 500, `got=${insights.expectedIncome}`);

console.log('\n[8] Trend sparklines');
const ledger = [
  { presentAmount: 1000, category: 'PRESENT_HAVING', status: 'open', createdAt: '2026-09-01' },
  { presentAmount: 500, category: 'EXPECTED_INCOME', status: 'open', createdAt: '2026-09-02' },
  { presentAmount: 200, category: 'PRESENT_EXPENSE', status: 'completed', createdAt: '2026-09-03' },
];
const presentSeries = buildCumulativeSeries(ledger, (note) => (normalizeCategory(note.category) === 'PRESENT_HAVING' ? amountOfNote(note) : 0));
check(
  'cumulative series starts at 0 and holds the running Present Saving total',
  JSON.stringify(presentSeries) === '[0,1000,1000,1000]',
  JSON.stringify(presentSeries)
);
check('unsorted input is ordered by createdAt', JSON.stringify(buildCumulativeSeries([ledger[2], ledger[0]], (note) => amountOfNote(note))) === '[0,1000,1200]', JSON.stringify(buildCumulativeSeries([ledger[2], ledger[0]], (note) => amountOfNote(note))));
check('empty ledger still yields a single start point', JSON.stringify(buildCumulativeSeries([], (note) => amountOfNote(note))) === '[0]');

const geometry = buildSparklineGeometry([0, 50, 100], 120, 32, 3);
check('sparkline path starts with a move command', geometry.line.startsWith('M'), geometry.line);
check('sparkline closes an area fill', geometry.area.endsWith('Z'), geometry.area);
check('3 points become 3 commands', (geometry.line.match(/[ML]/g) || []).length === 3, geometry.line);
const flat = buildSparklineGeometry([100, 100], 120, 32, 3);
check('flat series is drawn mid-box, still visible', flat.line.includes(',16.00') || flat.line.includes(',16,'), flat.line);
check('no NaN leaks into path data', !geometry.line.includes('NaN') && !flat.area.includes('NaN'), `${geometry.line} | ${flat.area}`);

console.log('\n[9] Category labels, aliases and board routing');
check('legacy "Present Having" maps to PRESENT_HAVING', normalizeCategory('Present Having') === 'PRESENT_HAVING');
check('new "Present Saving" label maps to PRESENT_HAVING', normalizeCategory('Present Saving') === 'PRESENT_HAVING');
check('removed SAVINGS maps to PRESENT_EXPENSE', normalizeCategory('SAVINGS') === 'PRESENT_EXPENSE');
check('"Planned Income" maps to EXPECTED_INCOME', normalizeCategory('Planned Income') === 'EXPECTED_INCOME');
check('"Expense" maps to PRESENT_EXPENSE', normalizeCategory('Expense') === 'PRESENT_EXPENSE');
check('missing category falls back to the default', normalizeCategory(undefined) === 'PRESENT_HAVING');
check(
  'composer dropdown order matches the brief',
  CATEGORY_FORM_OPTIONS.map((category) => category.formLabel).join('|') === 'Present Saving|Planned Income|Planned Expenses|Expense',
  CATEGORY_FORM_OPTIONS.map((category) => category.formLabel).join('|')
);
check('completed expected expense routes to the filed column', displayGroupKey({ category: 'EXPECTED_EXPENSE', status: 'completed' }) === 'PRESENT_EXPENSE');
check('open expected expense stays planned', displayGroupKey({ category: 'EXPECTED_EXPENSE', status: 'open' }) === 'EXPECTED_EXPENSE');
check('missing amounts read as 0', amountOfNote({}) === 0 && amountOfNote({ presentAmount: 'x' }) === 0);

console.log('\n[10] Futures summary (bucket cards + projections)');
const futuresSummary = deriveFuturesMetrics(apiSummary);
check(
  'bucket cards resolve the raw sums (1000 / 200 / 500 / 300)',
  futuresSummary.currentSavings === 1000 &&
    futuresSummary.spendExpense === 200 &&
    futuresSummary.plannedIncome === 500 &&
    futuresSummary.plannedExpense === 300,
  JSON.stringify(futuresSummary)
);
check(
  'Overall Income = Current Savings + Planned Income = 1000 + 500',
  closeTo(futuresSummary.overallIncome, 1500),
  `got=${futuresSummary.overallIncome}`
);
check(
  'Overall Expense = Spend Expense + Planned Expense = 200 + 300',
  closeTo(futuresSummary.overallExpense, 500),
  `got=${futuresSummary.overallExpense}`
);
check(
  'Overall Expected Savings = 1500 - 500',
  closeTo(futuresSummary.overallExpectedSavings, 1000),
  `got=${futuresSummary.overallExpectedSavings}`
);
check(
  'Futures projections agree with the calculated breakdown',
  closeTo(futuresSummary.overallIncome, base.overallIncome) &&
    closeTo(futuresSummary.overallExpense, base.entireExpense) &&
    closeTo(futuresSummary.overallExpectedSavings, base.totalExpectedSavings)
);
const emptyFutures = deriveFuturesMetrics({});
check(
  'empty ledger renders 0 in all seven fields',
  Object.values(emptyFutures).every((value) => value === 0),
  JSON.stringify(emptyFutures)
);
const junkFutures = deriveFuturesMetrics({
  presentIncome: null,
  totalExpense: 'not-a-number',
  totalExpectedIncome: NaN,
  totalExpectedExpense: undefined,
});
check(
  'null / text / NaN buckets all fall back to 0',
  Object.values(junkFutures).every((value) => value === 0),
  JSON.stringify(junkFutures)
);
const overspentFutures = deriveFuturesMetrics({ presentIncome: 100, totalExpense: 250 });
check(
  'overspend stays finite and negative',
  overspentFutures.overallExpectedSavings === -150,
  `got=${overspentFutures.overallExpectedSavings}`
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
