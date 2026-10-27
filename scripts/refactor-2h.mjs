/** REFACTOR STAGE 2H — filter tabs driven by the display groups. */
import fs from 'fs';

const P = 'C:/Users/MANI/OneDrive/Desktop/financial-ledger-app/frontend/src/pages/TaskNotes.jsx';
let s = fs.readFileSync(P, 'utf8').replace(/\r(?!\n)/g, '\r\n').replace(/(?<!\r)\n/g, '\r\n');

const oldTabs = `          {/* Category filter tabs — narrow the Open & Completed grids. */}`;
const start = s.indexOf(oldTabs.replace(/\r?\n/g, '\r\n'));
if (start === -1) throw new Error('tabs block not found');
const endMarker = '          </div>\r\n          {loading ? (';
const end = s.indexOf(endMarker, start);
if (end === -1) throw new Error('tabs end not found');

const newTabs = `          {/* Group filter tabs — one per category section. */}
          <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter tasks by category">
            <button
              type="button"
              role="tab"
              aria-selected={categoryFilter === 'ALL'}
              onClick={() => setCategoryFilter('ALL')}
              className={\`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all \${
                categoryFilter === 'ALL'
                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900'
              }\`}
            >
              All
              <span className={\`rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums \${categoryFilter === 'ALL' ? 'bg-white/20' : 'bg-slate-100'}\`}>
                {savedNotes.length}
              </span>
            </button>
            {GROUPS.map((group) => {
              const active = categoryFilter === group.key;
              return (
                <button
                  key={group.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategoryFilter(group.key)}
                  className={\`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all \${
                    active ? \`\${categoryBadgeClass(group.key)} shadow-sm\` : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900'
                  }\`}
                >
                  {group.label}
                  <span className={\`rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums \${active ? 'bg-white/60' : 'bg-slate-100'}\`}>
                    {groupCounts[group.key]}
                  </span>
                </button>
              );
            })}
          </div>
`;

s = s.slice(0, start) + newTabs.replace(/\r?\n/g, '\r\n') + s.slice(end + endMarker.replace(/\r?\n/g, '\r\n').length - '          {loading ? ('.length);
fs.writeFileSync(P, s, 'utf8');
console.log('STAGE 2H APPLIED: filter tabs -> GROUPS');
