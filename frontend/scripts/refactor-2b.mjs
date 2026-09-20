/** REFACTOR STAGE 2B — business metric model (part 1) + derived metrics. */
import fs from 'fs';

const P = 'C:/Users/MANI/OneDrive/Desktop/financial-ledger-app/frontend/src/pages/TaskNotes.jsx';
let s = fs.readFileSync(P, 'utf8').replace(/\r(?!\n)/g, '\r\n').replace(/(?<!\r)\n/g, '\r\n');
const log = [];
const edit = (needle, replacement, label) => {
  const n = needle.replace(/\r?\n/g, '\r\n');
  const first = s.indexOf(n);
  if (first === -1) throw new Error('NOT FOUND -> ' + label);
  if (s.indexOf(n, first + 1) !== -1) throw new Error('AMBIGUOUS -> ' + label);
  s = s.slice(0, first) + replacement.replace(/\r?\n/g, '\r\n') + s.slice(first + n.length);
  log.push(label);
};

/* 1. noteRemaining/NOTES_PER_PAGE -> business model (part 1) */
edit(
  `const noteRemaining = (note) =>
  Number(note.remainingBalance ?? (Number(note.presentAmount || 0) - Number(note.totalAmount ?? note.targetAmount ?? 0)));

const NOTES_PER_PAGE = 5;`,
  `// ---------------------------------------------------------------------------
// Business metric model (mirrors the backend buildTaskSummary())
// ---------------------------------------------------------------------------
// Categories whose amounts represent money currently held ("Present Income").
const INCOME_CATEGORIES = ['PRESENT_HAVING', 'SAVINGS'];
// Categories whose amounts represent money going out.
const EXPENSE_CATEGORIES = ['PRESENT_EXPENSE', 'EXPECTED_EXPENSE'];

// Display groups — every category renders as its own section with its own
// tasks and its own total. "Present Expense" is the COMPLETED bucket: any
// completed expense task is treated as Present Expense.
const GROUPS = [
  { key: 'PRESENT_HAVING', label: 'Present Having', hint: 'Available balance' },
  { key: 'PRESENT_EXPENSE', label: 'Present Expense', hint: 'Completed tasks' },
  { key: 'EXPECTED_INCOME', label: 'Expected Income', hint: 'Pending income' },
  { key: 'EXPECTED_EXPENSE', label: 'Expected Expense', hint: 'Pending expenses' },
  { key: 'SAVINGS', label: 'Savings', hint: 'Set aside' },
];

const amountOf = (note) => Number(note.presentAmount || 0);
const isCompleted = (note) => note.status === 'completed';

// Section a task is displayed under. Completed expense tasks move into the
// Present Expense group; every other task stays in its own category.
const displayGroupKey = (note) => {
  const category = normalizeCategory(note.category);
  if (isCompleted(note) && EXPENSE_CATEGORIES.includes(category)) return 'PRESENT_EXPENSE';
  return category;
};

// __SUMMARY_HELPERS__`,
  'business model part 1'
);

/* 2. old board totals -> composerTotal + summary + group counts */
edit(
  `  const rowRemaining = (row) => {
    const present = Number(row.presentAmount || 0);
    const target = Number(row.targetAmount || 0);
    return (Number.isFinite(present) ? present : 0) - (Number.isFinite(target) ? target : 0);
  };

  const composerTotals = rows.reduce(
    (sum, row) => {
      sum.present += Number(row.presentAmount || 0);
      sum.target += Number(row.targetAmount || 0);
      sum.remaining += rowRemaining(row);
      return sum;
    },
    { present: 0, target: 0, remaining: 0 }
  );

  // Full board totals (all notes, regardless of status).
  const boardTotals = savedNotes.reduce(
    (sum, note) => {
      sum.present += Number(note.presentAmount || 0);
      sum.target += Number(note.totalAmount ?? note.targetAmount ?? 0);
      sum.remaining += noteRemaining(note);
      return sum;
    },
    { present: 0, target: 0, remaining: 0 }
  );

  // Amounts tied to completed tasks. These are deducted from the primary
  // "Present Total" summary card in real time (no page reload needed) and
  // shown on their own dedicated "Completed Tasks Total" card.
  const completedNotes = savedNotes.filter((note) => note.status === 'completed');
  const completedTotals = completedNotes.reduce(
    (sum, note) => {
      sum.present += Number(note.presentAmount || 0);
      sum.target += Number(note.totalAmount ?? note.targetAmount ?? 0);
      sum.remaining += noteRemaining(note);
      return sum;
    },
    { present: 0, target: 0, remaining: 0 }
  );

  // Primary card value = all tasks minus completed task amounts.
  const activePresentTotal = boardTotals.present - completedTotals.present;
  const activeRemainingTotal = boardTotals.remaining - completedTotals.remaining;`,
  `  const composerTotal = rows.reduce((sum, row) => sum + Number(row.presentAmount || 0), 0);

  // Prefer the API-computed summary; fall back to the local mirror.
  const summary = apiSummary || computeSummary(savedNotes);

  // Task counts per display group (section headers + filter tabs).
  const groupCounts = GROUPS.reduce((acc, group) => {
    acc[group.key] = savedNotes.filter((note) => displayGroupKey(note) === group.key).length;
    return acc;
  }, {});`,
  'derived metrics: summary + groupCounts'
);

/* 3. drop the old per-category totals/counts (superseded above) */
edit(
  `  // Per-category real-time KPI totals (sum of each task's present amount,
  // grouped by its mapped category). Legacy notes without a category value are
  // treated as PRESENT_HAVING, matching the backend default.
  const noteCategory = (note) => note.category || DEFAULT_CATEGORY;
  const categoryTotals = CATEGORIES.reduce((acc, category) => {
    acc[category.value] = savedNotes
      .filter((note) => noteCategory(note) === category.value)
      .reduce((sum, note) => sum + Number(note.presentAmount || 0), 0);
    return acc;
  }, {});

  // Per-category task counts for the filter tabs.
  const categoryCounts = CATEGORIES.reduce((acc, category) => {
    acc[category.value] = savedNotes.filter((note) => noteCategory(note) === category.value).length;
    return acc;
  }, {});`,
  '',
  'drop old categoryTotals/categoryCounts'
);

fs.writeFileSync(P, s, 'utf8');
console.log('STAGE 2B APPLIED:');
log.forEach((l) => console.log('  - ' + l));
