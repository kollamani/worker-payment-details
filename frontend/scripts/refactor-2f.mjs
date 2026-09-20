/** REFACTOR STAGE 2F — remove pagination, replace KPI bar with metric cards. */
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

/* 1. delete the NotePagination component entirely (grouping replaced it) */
const beforePagination = s;
s = s.replace(
  / {2}const NotePagination = \(\{ page, pageCount, total, onPageChange \}\) => \{[\s\S]*?\r\n {2}\};\r\n\r\n {2}return \(/,
  '  return ('
);
if (s === beforePagination) throw new Error('NOT FOUND -> NotePagination component');
log.push('delete NotePagination component');

/* 2. KPI bar + legacy chip strip -> the four business metric cards */
edit(
  `        {/* Categorized KPI totals — one live card per task category. */}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CATEGORIES.map((category) => {
            const styles = CATEGORY_STYLES[category.value] || CATEGORY_STYLES.PRESENT_HAVING;
            const CategoryIcon = styles.Icon;
            return (
              <StatWidget
                key={category.value}
                icon={CategoryIcon}
                label={\`Total \${category.label}\`}
                value={categoryTotals[category.value]}
                tint={styles.tint}
                iconTint={styles.iconTint}
              />
            );
          })}
        </div>

        {/* Compact board-wide summary strip. */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-inset ring-slate-200">
            Present Total <strong className="ml-1 font-mono tabular-nums text-slate-800">{formatMoney(activePresentTotal)}</strong>
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-inset ring-slate-200">
            Target Total <strong className="ml-1 font-mono tabular-nums text-slate-800">{formatMoney(boardTotals.target)}</strong>
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-inset ring-slate-200">
            Remaining Balance <strong className="ml-1 font-mono tabular-nums text-slate-800">{formatMoney(activeRemainingTotal)}</strong>
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-inset ring-slate-200">
            Completed Tasks Total <strong className="ml-1 font-mono tabular-nums text-slate-800">{formatMoney(completedTotals.present)}</strong>
          </span>
        </div>`,
  `        {/* Dashboard metric cards — the four business totals. */}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SUMMARY_CARDS.map((card) => (
            <StatWidget
              key={card.key}
              icon={card.icon}
              label={card.label}
              value={summary[card.key] ?? 0}
              tint={card.tint}
              iconTint={card.iconTint}
            />
          ))}
        </div>

        {/* Live task counts. */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-inset ring-slate-200">
            Tasks <strong className="ml-1 font-mono tabular-nums text-slate-800">{summary.counts?.total ?? savedNotes.length}</strong>
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-inset ring-slate-200">
            Pending <strong className="ml-1 font-mono tabular-nums text-slate-800">{summary.counts?.open ?? 0}</strong>
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-inset ring-slate-200">
            Completed <strong className="ml-1 font-mono tabular-nums text-slate-800">{summary.counts?.completed ?? 0}</strong>
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-inset ring-slate-200">
            Savings <strong className="ml-1 font-mono tabular-nums text-slate-800">{formatMoney(summary.totalSavings ?? 0)}</strong>
          </span>
        </div>`,
  'KPI bar -> 4 business metric cards'
);

fs.writeFileSync(P, s, 'utf8');
console.log('STAGE 2F APPLIED:');
log.forEach((l) => console.log('  - ' + l));
