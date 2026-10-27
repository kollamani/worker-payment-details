// Worker pivot Excel export ("Worker Attendance/Wages Sheet").
//
// Turns transaction records into a matrix with one column per distinct
// transaction date:
//
//   name | j.no | worker | 01/10/2026 | 02/10/2026 | ... | total | half
//
// Two entry points feed the same writer:
// - `buildWorkerPivotFromGrid(gridRows, dateKeys)` — works from the canonical
//   member × date rows used across the app (the `/transactions/ledger/grid`
//   response and Dashboard's `filteredRows`), so an export always matches what
//   is rendered on screen.
// - `buildWorkerPivotFromTransactions(records)` — groups raw transaction
//   records by worker when only a flat list is at hand. An optional
//   `identities` seed keeps every worker visible (with zero cells) even when
//   they have no records in the window.
//
// The workbook is written with `xlsx-js-style` (drop-in SheetJS API) so
// headers can be bolded and grid borders applied; raw `xlsx@0.18.5` silently
// ignores cell styles.

import XLSX from 'xlsx-js-style';

const NUMBER_FORMAT = '#,##0.00';

const toDateKey = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  // Transaction dates are stored as UTC midnight of the intended calendar day,
  // so day keys must use UTC getters (same convention as Dashboard).
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const dateKeyLabel = (dateKey) => {
  // Parse the YYYY-MM-DD parts directly — round-tripping through
  // `new Date("…T00:00:00")` uses local midnight, and formatting that with
  // UTC getters shifts the day in positive UTC offsets (e.g. IST).
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

/** 1-based column index → spreadsheet letters (A, B, …, AA, …). */
const colLetters = (index) => {
  let letters = '';
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

const THIN_BORDER = { style: 'thin', color: { rgb: 'D9D9D9' } };

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: '1F2937' } },
  fill: { fgColor: { rgb: 'EDE9FE' } },
  border: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
};

const TEXT_STYLE = {
  border: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER },
  alignment: { horizontal: 'left', vertical: 'center' },
};

const NUMBER_STYLE = {
  border: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER },
  alignment: { horizontal: 'right', vertical: 'center' },
};

/**
 * Pivot shape shared by every entry point:
 *
 * @typedef {Object} WorkerPivotRow
 * @property {string}                name    Worker / account holder display name.
 * @property {string}                jNo     Job card number (exported as text).
 * @property {string}                worker  Owning worker/admin of the member.
 * @property {Record<string, number>} values Amount per date key (0 when no record).
 * @property {number}                total   Sum across the date columns.
 * @property {number}                half    total × 0.5.
 *
 * @typedef {Object} WorkerPivot
 * @property {string[]}             dates   Sorted chronological date keys (YYYY-MM-DD).
 * @property {WorkerPivotRow[]}     rows
 *
 * @typedef {Object} WorkerPivotRangeOptions
 * @property {string} [dateFrom] YYYY-MM-DD window start.
 * @property {string} [dateTo]   YYYY-MM-DD window end.
 */

const withinRange = (dateKey, dateFrom, dateTo) =>
  (!dateFrom || dateKey >= dateFrom) && (!dateTo || dateKey <= dateTo);

const emptyValueRecord = (dates) => dates.reduce((values, dateKey) => {
  values[dateKey] = 0;
  return values;
}, {});

const attachTotals = (pivotRow) => {
  pivotRow.total = Object.values(pivotRow.values).reduce((sum, value) => sum + value, 0);
  pivotRow.half = pivotRow.total * 0.5;
  return pivotRow;
};

const toIdentity = (value) => ({
  name: String(value?.workerName ?? value?.name ?? '—'),
  jNo: String(value?.jNo ?? ''),
  worker: String(value?.createdByWorker ?? value?.admin ?? value?.worker ?? ''),
});

/**
 * Build the pivot from canonical grid rows (member × date cells).
 *
 * Totals are re-derived from the date cells (not the precomputed fields) so the
 * exported sheet never disagrees with itself, even when a caller supplies a
 * narrower date window.
 *
 * @param {Array<{
 *   name?: string, workerName?: string, jNo?: string,
 *   createdByWorker?: string, admin?: string,
 *   cells?: Record<string, { deposit?: number, withdrawal?: number }>,
 * }>} gridRows
 * @param {string[]} dateKeys Column order/whitelist (already filtered if desired).
 * @param {Partial<WorkerPivotRangeOptions>} [options] Extra window applied over dateKeys.
 * @returns {WorkerPivot}
 */
export const buildWorkerPivotFromGrid = (gridRows, dateKeys, options = {}) => {
  const dates = (Array.isArray(dateKeys) ? dateKeys : [])
    .filter((dateKey) => toDateKey(dateKey))
    .filter((dateKey) => withinRange(dateKey, options.dateFrom, options.dateTo))
    .sort();

  const rows = (gridRows || []).map((gridRow) => {
    const cells = gridRow?.cells || {};
    const row = { ...toIdentity(gridRow), values: emptyValueRecord(dates), total: 0, half: 0 };
    dates.forEach((dateKey) => {
      // Date cells carry the wage/attendance amount recorded that day (the
      // deposit side); withdrawals live in their own columns elsewhere.
      row.values[dateKey] = Number(cells[dateKey]?.deposit || 0);
    });
    return attachTotals(row);
  });

  return { dates, rows };
};

/**
 * Build the pivot from raw transaction records (grouped by worker id).
 * Records may carry the member as a populated object (`record.member.name`,
 * …) or as a bare id resolved through `options.identities`.
 *
 * @param {Array<{
 *   member?: any, date?: any, type?: string,
 *   amount?: number, originalEnteredAmount?: number,
 * }>} records
 * @param {Partial<WorkerPivotRangeOptions & {
 *   identities?: Record<string, { name?: string, workerName?: string, jNo?: string,
 *                                worker?: string, createdByWorker?: string, admin?: string }>,
 *   dateKeys?: string[],
 * }>} [options]
 * @returns {WorkerPivot}
 */
export const buildWorkerPivotFromTransactions = (records, options = {}) => {
  const dateFrom = options.dateFrom || '';
  const dateTo = options.dateTo || '';
  const collectDates = !Array.isArray(options.dateKeys);

  const allDateKeys = []; // insertion order first, sorted at the end
  const grouped = new Map(); // memberId → { identity, byDate: Map<dateKey, number> }

  (records || []).forEach((record) => {
    const dateKey = toDateKey(record?.date);
    if (!dateKey || !withinRange(dateKey, dateFrom, dateTo)) return;
    if (collectDates && !allDateKeys.includes(dateKey)) allDateKeys.push(dateKey);

    const memberId = String(record?.member?._id ?? record?.member?.id ?? record?.member);
    if (!memberId) return;

    if (!grouped.has(memberId)) {
      grouped.set(memberId, {
        identity: record?.member && typeof record.member === 'object'
          ? toIdentity(record.member)
          : toIdentity(options.identities?.[memberId]),
        byDate: new Map(),
      });
    }

    // Wage/attendance value for the day: the deposit amount recorded that day
    // (falling back to the original entered amount). Withdrawals are not part
    // of this sheet and are ignored.
    if (record?.type !== 'deposit') return;
    const value = Number(record?.originalEnteredAmount ?? record?.amount ?? 0);
    if (!Number.isFinite(value)) return;

    const bucket = grouped.get(memberId);
    bucket.byDate.set(dateKey, (bucket.byDate.get(dateKey) || 0) + value);
  });

  // Seed every additional identity as a row so workers without transactions in
  // the window still appear (with zero cells) instead of silently vanishing.
  Object.entries(options.identities || {}).forEach(([memberId, identity]) => {
    if (!grouped.has(memberId)) {
      grouped.set(memberId, { identity: toIdentity(identity), byDate: new Map() });
    }
  });

  const dateKeys = collectDates
    ? allDateKeys.filter((key) => withinRange(key, dateFrom, dateTo))
    : options.dateKeys.filter((key) => withinRange(key, dateFrom, dateTo));
  const dates = dateKeys.sort();

  const rows = [];
  grouped.forEach((bucket) => {
    const row = { ...bucket.identity, values: emptyValueRecord(dates), total: 0, half: 0 };
    dates.forEach((dateKey) => {
      row.values[dateKey] = bucket.byDate.get(dateKey) || 0;
    });
    rows.push(attachTotals(row));
  });

  rows.sort((a, b) => a.name.localeCompare(b.name) || a.jNo.localeCompare(b.jNo));
  return { dates, rows };
};

/**
 * `Worker_Report_<range>.xlsx`, or `Worker_Report_<timestamp>.xlsx` when no
 * date window was selected.
 *
 * @param {{ fileName?: string, dateFrom?: string, dateTo?: string, createdAt?: Date }} [options]
 * @returns {string}
 */
export const buildPivotFileName = ({ fileName, dateFrom, dateTo, createdAt = new Date() } = {}) => {
  if (fileName) return fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const formatDay = (value) => {
    // String-part parsing avoids the local-midnight/UTC-getter day shift.
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return '';
    return `${match[3]}${MONTHS[Number(match[2]) - 1]}`;
  };

  if (dateFrom || dateTo) {
    const start = formatDay(dateFrom || dateTo);
    const end = formatDay(dateTo || dateFrom);
    return start === end
      ? `Worker_Report_${start}.xlsx`
      : `Worker_Report_${start}_to_${end}.xlsx`;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${createdAt.getFullYear()}-${pad(createdAt.getMonth() + 1)}-${pad(createdAt.getDate())}_${pad(createdAt.getHours())}${pad(createdAt.getMinutes())}`;
  return `Worker_Report_${timestamp}.xlsx`;
};

/**
 * Generate and download the .xlsx workbook.
 *
 * - `j.no` is written as text so leading zeros survive Excel.
 * - Date/total/half cells are numeric with a `#,##0.00` display format
 *   (never strings — no `###`-style truncation beyond narrow columns, which
 *   `!cols` prevents by auto-fitting from header labels and content).
 * - `total`/`half` are live formulas (`=SUM(...)`, `=<total>/2`) with cached
 *   values so they render in every spreadsheet app and stay self-updating.
 * - Bold headers and grid borders via `xlsx-js-style` cell styles.
 *
 * @param {WorkerPivot} pivot
 * @param {{ fileName?: string, sheetName?: string,
 *           dateFrom?: string, dateTo?: string, createdAt?: Date }} [options]
 * @returns {boolean} false when there is nothing to export (caller should toast).
 */
export const exportWorkerPivotXlsx = (pivot, options = {}) => {
  if (!pivot || !pivot.rows?.length) return false;

  const dates = pivot.dates || [];
  const sheetName = (options.sheetName || 'Worker Sheet').slice(0, 31);
  const rowCount = pivot.rows.length;

  const firstDateCol = 4; // 1-based: name=A, j.no=B, worker=C → dates start at D
  // A single reserved zero column keeps =SUM(D…) valid in the degenerate
  // "workers but no dates" case.
  const lastDateCol = Math.max(3 + dates.length, firstDateCol);
  const totalCol = lastDateCol + 1;
  const halfCol = totalCol + 1;
  const lastColIndex = halfCol - 1; // 0-based

  const headerRow = [
    'name',
    'j.no',
    'worker',
    ...dates.map(dateKeyLabel),
    // Pads the reserved zero column when there are no dates — mirrors the
    // zero padding in the data rows below so columns always line up.
    ...Array.from({ length: lastDateCol - 3 - dates.length }, () => ''),
    'total',
    'half',
  ];

  const aoa = [headerRow];
  pivot.rows.forEach((row) => {
    aoa.push([
      row.name,
      // Deliberately a string — keeps j card leading zeros intact.
      row.jNo,
      row.worker,
      ...dates.map((dateKey) => Number(row.values[dateKey] || 0)),
      ...Array.from({ length: lastDateCol - 3 - dates.length }, () => 0),
      null, // total: replaced by a formula cell below
      null, // half:  replaced by a formula cell below
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  // Style + number-format pass over the plain data cells.
  for (let r = 1; r <= rowCount; r += 1) {
    for (let c = 0; c < totalCol - 1; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[address];
      if (!cell) continue;
      if (cell.t === 'n') {
        cell.z = NUMBER_FORMAT;
        cell.s = NUMBER_STYLE;
      } else {
        cell.s = TEXT_STYLE;
      }
    }
    // Raw values in aoa_to_sheet slots become null → clean them out before
    // writing the formula cells.
    delete worksheet[XLSX.utils.encode_cell({ r, c: totalCol - 1 })];
    delete worksheet[XLSX.utils.encode_cell({ r, c: halfCol - 1 })];

    const excelRow = r + 1; // 1-based row as Excel shows it
    // total: =SUM(<firstDateCol>{row}:<lastDateCol>{row}) with cached value
    worksheet[XLSX.utils.encode_cell({ r, c: totalCol - 1 })] = {
      t: 'n',
      v: Number(pivot.rows[r - 1].total || 0),
      f: `SUM(${colLetters(firstDateCol)}${excelRow}:${colLetters(lastDateCol)}${excelRow})`,
      z: NUMBER_FORMAT,
      s: NUMBER_STYLE,
    };
    // half: =<totalCell>{row}/2 with cached value
    worksheet[XLSX.utils.encode_cell({ r, c: halfCol - 1 })] = {
      t: 'n',
      v: Number(pivot.rows[r - 1].half || 0),
      f: `${colLetters(totalCol)}${excelRow}/2`,
      z: NUMBER_FORMAT,
      s: NUMBER_STYLE,
    };
  }

  // Auto-fit column widths so headers and numbers never collapse to ###.
  worksheet['!cols'] = headerRow.map((header, index) => {
    if (index === 0) {
      return { wch: Math.min(Math.max(header.length + 2, ...pivot.rows.map((row) => row.name.length + 2), 16), 42) };
    }
    if (index === 1) return { wch: 10 };
    if (index === 2) {
      return { wch: Math.min(Math.max(header.length + 2, ...pivot.rows.map((row) => row.worker.length + 2), 16), 42) };
    }
    const isDateHeader = index >= 3 && index < 3 + dates.length;
    return { wch: Math.max(12, header.length + 1) };
  });

  worksheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowCount, c: lastColIndex } }),
  };

  // Header styling last (bold + fill + borders across the full header row).
  for (let c = 0; c <= lastColIndex; c += 1) {
    const address = XLSX.utils.encode_cell({ r: 0, c });
    if (worksheet[address]) worksheet[address].s = HEADER_STYLE;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, buildPivotFileName(options));
  return true;
};
