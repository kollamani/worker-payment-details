/** REFACTOR STAGE 2A — frontend imports/state/fetch cleanup. */
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
const del = (startMarker, endMarker, label) => {
  const i = s.indexOf(startMarker.replace(/\r?\n/g, '\r\n'));
  if (i === -1) throw new Error('NOT FOUND (start) -> ' + label);
  const e = endMarker.replace(/\r?\n/g, '\r\n');
  const j = s.indexOf(e, i);
  if (j === -1) throw new Error('NOT FOUND (end) -> ' + label);
  s = s.slice(0, i) + s.slice(j + e.length);
  log.push(label);
};

/* 1. imports — drop icons that only served the old KPI/pagination UI */
edit(
  "import { Plus, Trash2, Pencil, Check, X, CircleDashed, Wallet, Receipt, TrendingUp, TrendingDown, Search, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';",
  "import { Plus, Trash2, Pencil, Check, X, Wallet, Receipt, TrendingUp, TrendingDown, Search, ChevronDown } from 'lucide-react';",
  'imports: drop CircleDashed/ChevronLeft/ChevronRight'
);

/* 2. emptyRow — no Target field */
edit(
  "  presentAmount: '',\r\n  targetAmount: '',\r\n  category: DEFAULT_CATEGORY,\r\n});",
  "  presentAmount: '',\r\n  category: DEFAULT_CATEGORY,\r\n});",
  'emptyRow: drop targetAmount'
);

/* 3. remove CATEGORY_STYLES (superseded by SUMMARY_CARDS) */
del(
  '// KPI card gradient tint per category (badge label/colors live in',
  '};',
  'delete CATEGORY_STYLES'
);

/* 4. editForm — no Target field */
edit(
  "const [editForm, setEditForm] = useState({ description: '', note: '', presentAmount: '', targetAmount: '', category: DEFAULT_CATEGORY });",
  "const [editForm, setEditForm] = useState({ description: '', note: '', presentAmount: '', category: DEFAULT_CATEGORY });",
  'editForm: drop targetAmount'
);

/* 5. state — drop pagination, add the API summary */
edit(
  `  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [openPage, setOpenPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);`,
  `  const [categoryFilter, setCategoryFilter] = useState('ALL');
  // Summary metrics returned by the API (local recompute is the fallback).
  const [apiSummary, setApiSummary] = useState(null);`,
  'state: drop pagination, add apiSummary'
);

/* 6. fetch — capture the backend summary */
edit(
  "      setSavedNotes(taskNotes);\r\n    } catch (err) {",
  "      setSavedNotes(taskNotes);\r\n      setApiSummary(response.data?.summary || null);\r\n    } catch (err) {",
  'fetch: capture summary'
);

fs.writeFileSync(P, s, 'utf8');
console.log('STAGE 2A APPLIED:');
log.forEach((l) => console.log('  - ' + l));
