/** REFACTOR STAGE 2G — form (drop Target input + Have), footer, edit modal, copy. */
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

/* 1. composer amount row: drop the Target input + the Have readout */
edit(
  `                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Present amount (₹)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={row.presentAmount}
                          onChange={(event) => updateTaskRow(index, 'presentAmount', event.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900 shadow-sm placeholder:font-sans placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Target amount (₹)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.targetAmount}
                          onChange={(event) => updateTaskRow(index, 'targetAmount', event.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900 shadow-sm placeholder:font-sans placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Have</span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-brand-700">{formatMoney(rowRemaining(row))}</span>
                    </div>`,
  `                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Amount (₹)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={row.presentAmount}
                        onChange={(event) => updateTaskRow(index, 'presentAmount', event.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900 shadow-sm placeholder:font-sans placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </label>`,
  'composer: drop Target input + Have'
);

/* 2. composer footer totals */
edit(
  `            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <span>Present: <strong className="font-mono tabular-nums">{formatMoney(composerTotals.present)}</strong></span>
              <span>Target: <strong className="font-mono tabular-nums">{formatMoney(composerTotals.target)}</strong></span>
              <span>Have: <strong className="font-mono tabular-nums text-brand-700">{formatMoney(composerTotals.remaining)}</strong></span>
            </div>`,
  `            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <span>Total amount: <strong className="font-mono tabular-nums">{formatMoney(composerTotal)}</strong></span>
            </div>`,
  'composer footer total'
);

/* 3. edit modal: drop the Target input */
edit(
  `              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.targetAmount}
                onChange={(e) => setEditForm((prev) => ({ ...prev, targetAmount: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Target amount"
              />
`,
  '',
  'edit modal: drop Target input'
);

/* 4. copy updates */
edit(
  'Track present amounts, targets, and remaining balances in one focused workspace.',
  'Track income, expenses, and expected totals in one focused workspace.',
  'page subtitle'
);

edit(
  "Create one or more tasks. Have auto-calculates as Present minus Target.",
  'Create one or more tasks. Pick a category and enter the amount.',
  'form helper copy'
);

fs.writeFileSync(P, s, 'utf8');
console.log('STAGE 2G APPLIED:');
log.forEach((l) => console.log('  - ' + l));
