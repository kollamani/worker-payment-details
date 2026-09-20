/** REFACTOR STAGE 2D — payloads, search, grouping. */
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

/* 1. POST payload — amount only */
edit(
  `            presentAmount: Number(row.presentAmount),
            totalAmount: row.targetAmount === '' ? null : Number(row.targetAmount),
            targetAmount: row.targetAmount === '' ? null : Number(row.targetAmount),`,
  `            presentAmount: Number(row.presentAmount),`,
  'saveRows: drop target from payload'
);

/* 2. openEdit — no target prefill */
edit(
  `      presentAmount: note.presentAmount ?? '',
      targetAmount: note.totalAmount ?? note.targetAmount ?? '',`,
  `      presentAmount: note.presentAmount ?? '',`,
  'openEdit: drop target prefill'
);

/* 3. PUT payload — amount only */
edit(
  `        presentAmount: Number(editForm.presentAmount),
        totalAmount: editForm.targetAmount === '' ? null : Number(editForm.targetAmount),
        targetAmount: editForm.targetAmount === '' ? null : Number(editForm.targetAmount),`,
  `        presentAmount: Number(editForm.presentAmount),`,
  'saveEdit: drop target from payload'
);

/* 4. search haystack */
edit(
  `      String(note.presentAmount ?? ''),
      String(note.totalAmount ?? note.targetAmount ?? ''),
      String(note.remainingBalance ?? ''),`,
  `      String(note.presentAmount ?? ''),
      isCompleted(note) ? 'completed' : 'pending',`,
  'search: drop target fields'
);

/* 5. grouping replaces the open/completed pagination logic */
edit(
  `  // Category tab filter ('ALL' shows every task regardless of category).
  const matchesCategory = (note) => categoryFilter === 'ALL' || noteCategory(note) === categoryFilter;

  const openNotes = savedNotes.filter((note) => note.status !== 'completed' && matchesSearch(note) && matchesCategory(note));
  const completedNotesFiltered = completedNotes.filter((note) => matchesSearch(note) && matchesCategory(note));
  const openPageCount = Math.max(1, Math.ceil(openNotes.length / NOTES_PER_PAGE));
  const completedPageCount = Math.max(1, Math.ceil(completedNotesFiltered.length / NOTES_PER_PAGE));
  const visibleOpenNotes = openNotes.slice((openPage - 1) * NOTES_PER_PAGE, openPage * NOTES_PER_PAGE);
  const visibleCompletedNotes = completedNotesFiltered.slice(
    (completedPage - 1) * NOTES_PER_PAGE,
    completedPage * NOTES_PER_PAGE
  );

  useEffect(() => {
    setOpenPage(1);
    setCompletedPage(1);
  }, [search, categoryFilter]);

  useEffect(() => {
    setOpenPage((page) => Math.min(page, openPageCount));
  }, [openPageCount]);

  useEffect(() => {
    setCompletedPage((page) => Math.min(page, completedPageCount));
  }, [completedPageCount]);`,
  `  // Filter tabs operate on the display groups.
  const matchesCategory = (note) => categoryFilter === 'ALL' || displayGroupKey(note) === categoryFilter;

  // Every group carries its own filtered tasks and its own running total.
  const visibleGroups = GROUPS
    .filter((group) => categoryFilter === 'ALL' || group.key === categoryFilter)
    .map((group) => {
      const items = savedNotes.filter((note) => displayGroupKey(note) === group.key && matchesSearch(note));
      return { ...group, items, total: items.reduce((sum, note) => sum + amountOf(note), 0) };
    });

  const visibleTaskCount = visibleGroups.reduce((count, group) => count + group.items.length, 0);`,
  'grouping replaces pagination logic'
);

fs.writeFileSync(P, s, 'utf8');
console.log('STAGE 2D APPLIED:');
log.forEach((l) => console.log('  - ' + l));
