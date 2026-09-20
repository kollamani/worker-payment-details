/** REFACTOR STAGE 2I — replace Open/Completed sections with category group sections. */
import fs from 'fs';

const P = 'C:/Users/MANI/OneDrive/Desktop/financial-ledger-app/frontend/src/pages/TaskNotes.jsx';
let s = fs.readFileSync(P, 'utf8').replace(/\r(?!\n)/g, '\r\n').replace(/(?<!\r)\n/g, '\r\n');

/* 1. empty-state condition */
const condBefore = s;
s = s.replace(
  ') : openNotes.length === 0 && completedNotesFiltered.length === 0 ? (',
  ') : visibleTaskCount === 0 ? ('
);
if (s === condBefore) throw new Error('empty-state condition not found');

/* 2. swap the two old sections for grouped sections */
const sectionRegex = / {12}<div className="space-y-8">[\s\S]*?\r\n {12}<\/div>\r\n {10}\)\}/;
if (!sectionRegex.test(s)) throw new Error('sections block not found');

const newSections = `            <div className="space-y-6">
              {visibleGroups.map((group) => (
                <section key={group.key} className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={\`rounded-full border px-2.5 py-1 text-[11px] font-semibold \${categoryBadgeClass(group.key)}\`}>
                        {group.label}
                      </span>
                      <span className="text-xs text-slate-500">{group.hint}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="rounded-full bg-white px-2.5 py-1 font-medium ring-1 ring-inset ring-slate-200">
                        {group.items.length} {group.items.length === 1 ? 'task' : 'tasks'}
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">{formatMoney(group.total)}</span>
                    </div>
                  </div>
                  {group.items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
                      No tasks in this category yet.
                    </p>
                  ) : (
                    <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-6">
                      {group.items.map((note) => (
                        <NoteCard key={note._id} note={note} />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}`;

s = s.replace(sectionRegex, newSections.replace(/\r?\n/g, '\r\n'));
fs.writeFileSync(P, s, 'utf8');
console.log('STAGE 2I APPLIED: grouped category sections');
