// Single source of truth for task-note categories.
//
//   value     — the enum persisted by the backend. NEVER rename these.
//   label     — short label used by badges, filter pills and board cards.
//   formLabel — label used by the category <select> in the composer/edit form.
//   column    — the board column id this category is rendered under.
//   colorClass— badge colors; accent — sparkline/indicator color.
export const CATEGORIES = [
  { value: 'PRESENT_HAVING', label: 'Present Saving', formLabel: 'Present Saving', column: 'current-savings', colorClass: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800', dotClass: 'bg-blue-500', accent: '#2563EB' },
  { value: 'PRESENT_EXPENSE', label: 'Present Expense', formLabel: 'Expense', column: 'filed-expenses', colorClass: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800', dotClass: 'bg-rose-500', accent: '#E11D48' },
  { value: 'EXPECTED_INCOME', label: 'Expected Income', formLabel: 'Planned Income', column: 'planned-income', colorClass: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-800', dotClass: 'bg-emerald-500', accent: '#059669' },
  { value: 'EXPECTED_EXPENSE', label: 'Expected Expense', formLabel: 'Planned Expenses', column: 'planned-expenses', colorClass: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800', dotClass: 'bg-amber-500', accent: '#F59E0B' },
];

export const DEFAULT_CATEGORY = 'PRESENT_HAVING';

export const CATEGORY_VALUES = CATEGORIES.map((category) => category.value);

// Composer <select> order requested by the design brief:
// Present Saving, Planned Income, Planned Expenses, Expense.
export const CATEGORY_FORM_ORDER = ['PRESENT_HAVING', 'EXPECTED_INCOME', 'EXPECTED_EXPENSE', 'PRESENT_EXPENSE'];

export const CATEGORY_FORM_OPTIONS = [...CATEGORIES].sort(
  (a, b) => CATEGORY_FORM_ORDER.indexOf(a.value) - CATEGORY_FORM_ORDER.indexOf(b.value)
);

// Categories whose amounts represent money currently held ("Present Saving").
// PRESENT_EXPENSE replaces the removed 'SAVINGS' option and is the expense
// bucket — its completed tasks reduce the balance, they are never income.
export const INCOME_CATEGORIES = ['PRESENT_HAVING'];
// Categories whose amounts represent money going out.
export const EXPENSE_CATEGORIES = ['PRESENT_EXPENSE', 'EXPECTED_EXPENSE'];

// Filter pills / bucket definitions (one per display group).
export const CATEGORY_GROUPS = [
  { key: 'PRESENT_HAVING', label: 'Present Saving', hint: 'Available balance', accentClass: 'bg-blue-500' },
  { key: 'PRESENT_EXPENSE', label: 'Present Expense', hint: 'Completed & filed expenses', accentClass: 'bg-rose-500' },
  { key: 'EXPECTED_INCOME', label: 'Expected Income', hint: 'Pending income', accentClass: 'bg-emerald-500' },
  { key: 'EXPECTED_EXPENSE', label: 'Expected Expense', hint: 'Pending expenses', accentClass: 'bg-amber-500' },
];

// Every label variant that has ever been shown to a user, mapped back to the
// canonical enum value. Keeps legacy documents (and translated/renamed labels)
// rendering in the right bucket instead of silently falling back to the
// default category.
const CATEGORY_ALIASES = {
  SAVINGS: 'PRESENT_EXPENSE',
  EXPENSE: 'PRESENT_EXPENSE',
  'PRESENT EXPENSE': 'PRESENT_EXPENSE',
  'PRESENT HAVING': 'PRESENT_HAVING',
  'PRESENT SAVING': 'PRESENT_HAVING',
  'PRESENT SAVINGS': 'PRESENT_HAVING',
  'CURRENT SAVINGS': 'PRESENT_HAVING',
  'EXPECTED INCOME': 'EXPECTED_INCOME',
  'PLANNED INCOME': 'EXPECTED_INCOME',
  'PENDING INCOME': 'EXPECTED_INCOME',
  'EXPECTED EXPENSE': 'EXPECTED_EXPENSE',
  'EXPECTED EXPENSES': 'EXPECTED_EXPENSE',
  'PLANNED EXPENSE': 'EXPECTED_EXPENSE',
  'PLANNED EXPENSES': 'EXPECTED_EXPENSE',
  'PENDING EXPENSE': 'EXPECTED_EXPENSE',
  'PENDING EXPENSES': 'EXPECTED_EXPENSE',
};

/**
 * Normalizes any incoming category value (enum key, current or legacy label,
 * or a casing variant) into a canonical enum key.
 */
export const normalizeCategory = (categoryValue) => {
  if (!categoryValue) return DEFAULT_CATEGORY;
  const raw = String(categoryValue).trim();
  if (!raw) return DEFAULT_CATEGORY;
  const upper = raw.toUpperCase().replace(/\s+/g, ' ');
  if (CATEGORY_VALUES.includes(upper)) return upper;
  return CATEGORY_ALIASES[upper] || upper;
};

/** Display metadata (label + badge colors) for a category value. */
export const getCategoryDetails = (categoryValue) => {
  const normalized = normalizeCategory(categoryValue);
  return CATEGORIES.find((category) => category.value === normalized) ||
    CATEGORIES.find((category) => category.value === DEFAULT_CATEGORY);
};

export const categoryLabel = (categoryValue) => getCategoryDetails(categoryValue).label;
export const categoryShortLabel = categoryLabel;
export const categoryBadgeClass = (categoryValue) => getCategoryDetails(categoryValue).colorClass;
export const categoryAccent = (categoryValue) => getCategoryDetails(categoryValue).accent;

/** Null-safe amount reader shared by every card, bucket and total. */
export const amountOfNote = (note) => {
  const amount = Number(note?.presentAmount);
  return Number.isFinite(amount) ? amount : 0;
};

export const isCompletedNote = (note) => note?.status === 'completed';

// Section a task is displayed under. Completed expense tasks move into the
// Present Expense group; every other task stays in its own category.
export const displayGroupKey = (note) => {
  const category = normalizeCategory(note?.category);
  if (isCompletedNote(note) && EXPENSE_CATEGORIES.includes(category)) return 'PRESENT_EXPENSE';
  return category;
};
