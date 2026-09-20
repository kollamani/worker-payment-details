/** REFACTOR STAGE 2E — NoteCard amount block. */
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

edit(
  `    const targetValue = note.totalAmount ?? note.targetAmount;`,
  `    const groupKey = displayGroupKey(note);`,
  'NoteCard: derive display group'
);

edit(
  `        {/* Compact horizontal balance row: Present | Target side by side, Have full-width */}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Present</p>
            <p className="truncate font-mono text-[13px] font-semibold leading-5 tabular-nums text-slate-900">{formatMoney(note.presentAmount)}</p>
          </div>
          <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Target</p>
            <p className="truncate font-mono text-[13px] font-semibold leading-5 tabular-nums text-slate-900">
              {targetValue === null || targetValue === undefined ? '—' : formatMoney(targetValue)}
            </p>
          </div>
          <div className="col-span-2 min-w-0 rounded-lg bg-brand-50/80 px-2 py-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-brand-700/80">Have</p>
            <p className="truncate font-mono text-[13px] font-semibold leading-5 tabular-nums text-brand-700">{formatMoney(noteRemaining(note))}</p>
          </div>
        </div>`,
  `        {/* Amount block — the Target / Have pair was removed with the Target field. */}
        <div className="mt-2 min-w-0 rounded-lg bg-slate-50 px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            {isCompleted(note) ? 'Expense (completed)' : 'Amount'}
          </p>
          <p className="truncate font-mono text-base font-semibold leading-6 tabular-nums text-slate-900">{formatMoney(amountOf(note))}</p>
        </div>`,
  'NoteCard: single amount block'
);

fs.writeFileSync(P, s, 'utf8');
console.log('STAGE 2E APPLIED:');
log.forEach((l) => console.log('  - ' + l));
