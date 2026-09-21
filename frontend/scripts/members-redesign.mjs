import fs from 'node:fs';

const target = 'src/pages/Members.jsx';
const snippetPath = 'scripts/grid-snippet.txt';

let src = fs.readFileSync(target, 'utf8');
const grid = fs.readFileSync(snippetPath, 'utf8').replace(/\r\n/g, '\n');
if (!src.includes('\r\n')) {
  // normalize snippet to file's line endings if file is CRLF
  src = src; // unchanged
}

// 1) Replace the desktop table block (start anchor .. through the mobile-list comment) with the new grid
const startAnchor = '        <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:block">';
const commentAnchor = '{/* Mobile / tablet card list */}';

const start = src.indexOf(startAnchor);
const commentIdx = src.indexOf(commentAnchor);
if (start === -1 || commentIdx === -1 || start > commentIdx) {
  console.error('FAIL: table anchors not found', { start, commentIdx });
  process.exit(1);
}
src = src.slice(0, start) + grid + src.slice(commentIdx + commentAnchor.length);

// 2) Delete the legacy mobile card list entirely (single data view now)
const mobileAnchor = '        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">';
const mainAnchor = '      </main>';
const mobileStart = src.indexOf(mobileAnchor);
const mainIdx = src.indexOf(mainAnchor);
if (mobileStart === -1 || mainIdx === -1 || mobileStart > mainIdx) {
  console.error('FAIL: mobile anchors not found', { mobileStart, mainIdx });
  process.exit(1);
}
src = src.slice(0, mobileStart) + src.slice(mainIdx);

fs.writeFileSync(target, src, 'utf8');

// Verification report
const checks = {
  'card grid mapped once': (src.match(/filtered\.map\(\(m, index\)/g) || []).length === 1,
  'no desktop table left': !src.includes('<table'),
  'no legacy mobile list left': !src.includes('lg:hidden'),
  'no worker-nav-link left': !src.includes('worker-nav-link'),
  'no table-row-hover left': !src.includes('table-row-hover'),
  'no light page bg left': !src.includes('bg-slate-50'),
  'no mojibake left': !src.includes('\u00e2\u20ac\u201d'),
  '5 neon palettes': (src.match(/rgba\(244,63,94|rgba\(45,212,191|rgba\(251,191,36|rgba\(192,132,252|rgba\(56,189,248/g) || []).length >= 10,
  'all handlers intact': ['openAddForm', 'openEditForm', 'requestDelete', 'confirmDelete', 'handleFormSubmit', 'setSearch'].every((fn) => src.includes(fn)),
  'ledger routing intact': src.includes('to={`/users/${m._id}`}'),
  'modals intact': src.includes('<MemberForm') && src.includes('<ConfirmModal'),
};
let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass) ok = false;
}
console.log(ok ? 'ALL STITCH CHECKS PASSED' : 'STITCH CHECKS FAILED');
process.exit(ok ? 0 : 1);
