/**
 * REFACTOR STAGE 1A — backend model + GET summary metrics.
 */
import fs from 'fs';

const ROOT = 'C:/Users/MANI/OneDrive/Desktop/financial-ledger-app/backend/';
const read = (p) => fs.readFileSync(ROOT + p, 'utf8').replace(/\r(?!\n)/g, '\r\n').replace(/(?<!\r)\n/g, '\r\n');
const write = (p, s) => fs.writeFileSync(ROOT + p, s, 'utf8');

const log = [];
const edit = (file, needle, replacement, label) => {
  let s = read(file);
  const n = needle.replace(/\r?\n/g, '\r\n');
  const first = s.indexOf(n);
  if (first === -1) throw new Error(`NOT FOUND [${label}] in ${file}`);
  if (s.indexOf(n, first + 1) !== -1) throw new Error(`AMBIGUOUS [${label}] in ${file}`);
  s = s.slice(0, first) + replacement.replace(/\r?\n/g, '\r\n') + s.slice(first + n.length);
  write(file, s);
  log.push(`${file}: ${label}`);
};

/* A) MODEL — remove the Target-derived fields */
edit('models/TaskNote.js',
`    targetAmount: {
      type: Number,
      default: null,
      min: [0, 'Target amount cannot be negative'],
    },
    totalAmount: {
      type: Number,
      default: null,
      min: [0, 'Total amount cannot be negative'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    remainingBalance: {
      type: Number,
      default: 0,
    },
`,
`    createdAt: {
      type: Date,
      default: Date.now,
    },
`, 'model: drop targetAmount/totalAmount/remainingBalance');

/* B) CONTROLLER — summary metrics helper */
edit('controllers/taskNoteController.js',
`const buildTaskNoteQuery = (req, extraFilter = {}) => ({`,
`// Categories whose amounts represent money currently held ("Present Income").
const INCOME_CATEGORIES = ['PRESENT_HAVING', 'SAVINGS'];

/**
 * Dashboard summary metrics — single source of truth for the 4 metric cards.
 *   1. totalPresentHaving   = Present Income (PRESENT_HAVING + SAVINGS)
 *                             - Present Expense (every COMPLETED task)
 *   2. totalExpense         = every COMPLETED task (Present Expense == completed)
 *   3. totalExpectedIncome  = pending (open) EXPECTED_INCOME tasks
 *   4. totalExpectedExpense = pending (open) EXPECTED_EXPENSE tasks
 */
const buildTaskSummary = (notes) => {
  const amountOf = (note) => Number(note.presentAmount || 0);
  const categoryOf = (note) => note.category || DEFAULT_TASK_NOTE_CATEGORY;
  const isCompleted = (note) => note.status === 'completed';

  const presentIncome = notes
    .filter((note) => INCOME_CATEGORIES.includes(categoryOf(note)))
    .reduce((sum, note) => sum + amountOf(note), 0);

  const totalExpense = notes.filter(isCompleted).reduce((sum, note) => sum + amountOf(note), 0);

  const pendingOf = (category) =>
    notes
      .filter((note) => !isCompleted(note) && categoryOf(note) === category)
      .reduce((sum, note) => sum + amountOf(note), 0);

  return {
    totalPresentHaving: presentIncome - totalExpense,
    presentIncome,
    totalExpense,
    totalExpectedIncome: pendingOf('EXPECTED_INCOME'),
    totalExpectedExpense: pendingOf('EXPECTED_EXPENSE'),
    totalSavings: notes
      .filter((note) => categoryOf(note) === 'SAVINGS')
      .reduce((sum, note) => sum + amountOf(note), 0),
    counts: {
      total: notes.length,
      completed: notes.filter(isCompleted).length,
      open: notes.filter((note) => !isCompleted(note)).length,
    },
  };
};

const buildTaskNoteQuery = (req, extraFilter = {}) => ({`,
'controller: add summary helpers');

/* GET — return summary built from the full set */
edit('controllers/taskNoteController.js',
`    const taskNotes = await TaskNote.find(buildTaskNoteQuery(req, category ? { category } : {})).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: taskNotes.length, taskNotes });`,
`    // Always load the full set so the summary reflects every task, then slice
    // the response when a category filter is requested.
    const taskNotes = await TaskNote.find(buildTaskNoteQuery(req)).sort({ createdAt: -1 });
    const visibleNotes = category ? taskNotes.filter((taskNote) => taskNote.category === category) : taskNotes;
    res.status(200).json({
      success: true,
      count: visibleNotes.length,
      taskNotes: visibleNotes,
      summary: buildTaskSummary(taskNotes),
    });`,
'controller: GET returns summary');

console.log('STAGE 1A APPLIED:');
log.forEach((l) => console.log('  - ' + l));
