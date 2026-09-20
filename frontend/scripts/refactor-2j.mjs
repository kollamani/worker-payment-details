/** Cleanup: stale comments + final build validation. */
import fs from 'fs';
import { execSync } from 'child_process';

const P = 'C:/Users/MANI/OneDrive/Desktop/financial-ledger-app/frontend/src/pages/TaskNotes.jsx';
let s = fs.readFileSync(P, 'utf8').replace(/\r(?!\n)/g, '\r\n').replace(/(?<!\r)\n/g, '\r\n');

const fixes = [
  ["// Dedicated category handler: updates ONLY the target row's `category`",
   "// Dedicated category handler: updates ONLY that row's `category`"],
  ["{/* Amount block — the Target / Have pair was removed with the Target field. */}",
   "{/* Amount block */}"],
];
fixes.forEach(([from, to]) => {
  const n = from.replace(/\r?\n/g, '\r\n');
  if (s.indexOf(n) === -1) throw new Error('NOT FOUND -> ' + from);
  s = s.replace(n, to.replace(/\r?\n/g, '\r\n'));
});
fs.writeFileSync(P, s, 'utf8');

const checks = {
  'target/totalAmount/remainingBalance refs': (s.match(/targetAmount|totalAmount|remainingBalance/gi) || []).length,
  'Target word (any case)': (s.match(/target/gi) || []).length,
  'noteRemaining refs': (s.match(/noteRemaining/g) || []).length,
  'NotePagination refs': (s.match(/NotePagination/g) || []).length,
  'CATEGORY_STYLES refs': (s.match(/CATEGORY_STYLES/g) || []).length,
  'openPage/completedPage refs': (s.match(/openPage|completedPage/g) || []).length,
  'SUMMARY_CARDS present': s.includes('SUMMARY_CARDS'),
  'GROUPS present': s.includes('const GROUPS = ['),
  'computeSummary present': s.includes('computeSummary'),
  'apiSummary present': s.includes('apiSummary'),
};
Object.entries(checks).forEach(([k, v]) => console.log(`${k}: ${v}`));

console.log('line endings CRLF only:', !/\r(?!\n)/.test(s) && !/(?<!\r)\n/.test(s));
console.log('\n--- build ---');
try {
  execSync('npm run build', { cwd: 'C:/Users/MANI/OneDrive/Desktop/financial-ledger-app/frontend', stdio: 'pipe' });
  console.log('BUILD OK');
} catch (err) {
  console.log('BUILD FAILED');
  console.log((err.stdout || '').toString().split('\n').slice(-25).join('\n'));
  console.log((err.stderr || '').toString().split('\n').slice(-15).join('\n'));
}
