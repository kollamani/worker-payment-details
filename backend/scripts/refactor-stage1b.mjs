/**
 * REFACTOR STAGE 1B — drop Target handling from create/update + logging cleanup.
 */
import fs from 'fs';

const ROOT = 'C:/Users/MANI/OneDrive/Desktop/financial-ledger-app/backend/';
const read = (p) => fs.readFileSync(ROOT + p, 'utf8').replace(/\r(?!\n)/g, '\r\n').replace(/(?<!\r)\n/g, '\r\n');
const write = (p, s) => fs.writeFileSync(ROOT + p, s, 'utf8');

const log = [];
const edit = (file, needle, replacement, label) => {
  let s = read(file);
  const n = needle.replace(/\r?\n/g, '\r\n');
  const first = s.indexOf(n);
  if (first === -1) throw new Error(`NOT FOUND [${label}] in ${file}`);
  if (s.indexOf(n, first + 1) !== -1) throw new Error(`AMBIGUOUS [${label}] in ${file}`);
  s = s.slice(0, first) + replacement.replace(/\r?\n/g, '\r\n') + s.slice(first + n.length);
  write(file, s);
  log.push(`${file}: ${label}`);
};

/* createTaskNote — drop target parsing/validation/storage */
edit('controllers/taskNoteController.js',
`    const { description, presentAmount, note: requestedNote, category: requestedCategory } = req.body;
    const requestedTotal = req.body.totalAmount ?? req.body.targetAmount;
    const present = Number(presentAmount);
    const target = requestedTotal === '' || requestedTotal === null || requestedTotal === undefined
      ? null
      : Number(requestedTotal);
    
    if (!description?.trim()) {`,
`    const { description, presentAmount, note: requestedNote, category: requestedCategory } = req.body;
    const present = Number(presentAmount);

    if (!description?.trim()) {`,
'controller: create drops target parsing');

edit('controllers/taskNoteController.js',
`    if (target !== null && (!Number.isFinite(target) || target < 0)) {
      return res.status(400).json({ success: false, message: 'Target amount must be a valid non-negative number' });
    }
    if (requestedNote !== undefined && requestedNote !== null && typeof requestedNote !== 'string') {`,
`    if (requestedNote !== undefined && requestedNote !== null && typeof requestedNote !== 'string') {`,
'controller: create drops target validation');

edit('controllers/taskNoteController.js',
`      presentAmount: present,
      targetAmount: target,
      totalAmount: target,
      remainingBalance: present - (target ?? 0),
      status: 'open',`,
`      presentAmount: present,
      status: 'open',`,
'controller: create stores no target fields');

/* updateTaskNote — drop target block + remainingBalance recompute */
edit('controllers/taskNoteController.js',
`    if (req.body.totalAmount !== undefined || req.body.targetAmount !== undefined) {
      const requestedTotal = req.body.totalAmount ?? req.body.targetAmount;
      const target = requestedTotal === '' || requestedTotal === null
        ? null
        : Number(requestedTotal);
      if (target !== null && (!Number.isFinite(target) || target < 0)) {
        return res.status(400).json({ success: false, message: 'Target amount must be a valid non-negative number' });
      }
      taskNote.targetAmount = target;
      taskNote.totalAmount = target;
    }

    if (req.body.status !== undefined) {`,
`    if (req.body.status !== undefined) {`,
'controller: update drops target block');

edit('controllers/taskNoteController.js',
`    taskNote.remainingBalance =
      Number(taskNote.presentAmount || 0) - Number(taskNote.targetAmount ?? taskNote.totalAmount ?? 0);

    await taskNote.save();`,
`    await taskNote.save();`,
'controller: update drops remainingBalance recompute');

/* Debug logging removal */
edit('controllers/taskNoteController.js',
`const createTaskNote = async (req, res, next) => {
  console.log("====================================");
  console.log("🚀 CONTROLLER HIT: createTaskNote");
  console.log("BACKEND RECEIVED REQ.BODY:", req.body);
  console.log("====================================");
  try {`,
`const createTaskNote = async (req, res, next) => {
  try {`,
'controller: remove debug logs');

edit('server.js',
`// Keep this before route registration so Render logs show the exact path
// reaching the deployed Express process during route troubleshooting.
app.use((req, res, next) => {
  console.log(\`[request] \${req.method} \${req.originalUrl}\`);
  next();
});

`, '', 'server: remove per-request logging middleware');

console.log('STAGE 1B APPLIED:');
log.forEach((l) => console.log('  - ' + l));
