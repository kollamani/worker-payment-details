/** REFACTOR STAGE 2C — summary helpers + metric cards. */
import fs from 'fs';

const P = 'C:/Users/MANI/OneDrive/Desktop/financial-ledger-app/frontend/src/pages/TaskNotes.jsx';
let s = fs.readFileSync(P, 'utf8').replace(/\r(?!\n)/g, '\r\n').replace(/(?<!\r)\n/g, '\r\n');

const marker = '// __SUMMARY_HELPERS__';
if (s.indexOf(marker) === -1) throw new Error('marker not found');

const block = `// Local mirror of the backend summary, used when the API response has no
// \`summary\` payload (older deployments).
const computeSummary = (notes) => {
  const presentIncome = notes
    .filter((note) => INCOME_CATEGORIES.includes(normalizeCategory(note.category)))
    .reduce((sum, note) => sum + amountOf(note), 0);
  const completed = notes.filter(isCompleted);
  const totalExpense = completed.reduce((sum, note) => sum + amountOf(note), 0);
  const pendingOf = (category) =>
    notes
      .filter((note) => !isCompleted(note) && normalizeCategory(note.category) === category)
      .reduce((sum, note) => sum + amountOf(note), 0);
  return {
    totalPresentHaving: presentIncome - totalExpense,
    presentIncome,
    totalExpense,
    totalExpectedIncome: pendingOf('EXPECTED_INCOME'),
    totalExpectedExpense: pendingOf('EXPECTED_EXPENSE'),
    totalSavings: notes
      .filter((note) => normalizeCategory(note.category) === 'SAVINGS')
      .reduce((sum, note) => sum + amountOf(note), 0),
    counts: { total: notes.length, completed: completed.length, open: notes.length - completed.length },
  };
};

// The four dashboard metric cards required by the business spec.
const SUMMARY_CARDS = [
  { key: 'totalPresentHaving', label: 'Total Present Having', icon: Wallet, tint: 'from-emerald-50 via-white to-teal-50', iconTint: 'bg-emerald-100 text-emerald-700' },
  { key: 'totalExpense', label: 'Total Expense', icon: Receipt, tint: 'from-rose-50 via-white to-pink-50', iconTint: 'bg-rose-100 text-rose-700' },
  { key: 'totalExpectedIncome', label: 'Total Expected Income', icon: TrendingUp, tint: 'from-sky-50 via-white to-cyan-50', iconTint: 'bg-sky-100 text-sky-700' },
  { key: 'totalExpectedExpense', label: 'Total Expected Expense', icon: TrendingDown, tint: 'from-amber-50 via-white to-orange-50', iconTint: 'bg-amber-100 text-amber-700' },
];`;

s = s.replace(marker, block.replace(/\r?\n/g, '\r\n'));
fs.writeFileSync(P, s, 'utf8');
console.log('STAGE 2C APPLIED: summary helpers + SUMMARY_CARDS');
