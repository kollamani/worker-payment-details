import React from 'react';
import { Link } from 'react-router-dom';

const formatMoney = (v) =>
  `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDateHeader = (dateKey) => {
  const [y, m, d] = dateKey.split('-');
  return `${d}-${m}-${y.slice(2)}`;
};

const LedgerTable = ({
  dates,
  rows,
  grandTotals,
  selectedVillage,
  selectedWorker,
  searchTerm,
  selectedDate,
}) => {
  const visibleRows = (rows || []).filter((row) => {
    const term = (searchTerm || '').trim().toLowerCase();
    if (!term) return true;
    return (
      (row.workerName ?? row.name)?.toLowerCase().includes(term) ||
      (row.admin ?? row.createdByWorker)?.toLowerCase().includes(term) ||
      row.jNo?.toLowerCase().includes(term) ||
      row.villageName?.toLowerCase().includes(term)
    );
  });

  const displayTotals =
    visibleRows.length === (rows || []).length
      ? grandTotals
      : visibleRows.reduce(
          (acc, row) => {
            acc.totalDeposited += row.totalDeposited || 0;
            acc.totalWithdrawn += row.totalWithdrawn || 0;
            acc.pendingBalance += row.pendingBalance || 0;
            return acc;
          },
          { totalDeposited: 0, totalWithdrawn: 0, pendingBalance: 0 }
        );
  displayTotals.halfAmount = (displayTotals.totalDeposited || 0) / 2;

  const emptyState = (!rows || rows.length === 0) && !selectedVillage && !searchTerm;

  if (emptyState) {
    if (selectedDate) {
      return (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-500">
          No user activity or transactions found for {new Date(selectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-500">
        No workers or transactions yet. Add a worker and record a transaction to see the ledger sheet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Ledger Sheet</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {visibleRows.length} of {(rows || []).length} workers
            {selectedVillage || selectedWorker ? ' · filtered' : ''}
          </p>
        </div>
        <p className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
          Click a worker name to view their full payment history.
        </p>
      </div>

      <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
        <table className="min-w-full table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 shadow-sm">
            <tr className="bg-slate-100/90 text-[11px] uppercase tracking-[0.12em] text-slate-600">
              <th className="min-w-[56px] border-b border-slate-200 px-4 py-3.5 text-center font-bold">S.No</th>
              <th className="min-w-[64px] border-b border-slate-200 px-4 py-3.5 text-center font-bold">J.No</th>
              <th className="min-w-[180px] border-b border-slate-200 px-4 py-3.5 text-left font-bold">Worker Name</th>
              <th className="min-w-[120px] border-b border-slate-200 px-4 py-3.5 text-left font-bold">Village</th>
              <th className="min-w-[140px] border-b border-slate-200 px-4 py-3.5 text-left font-bold">Admin</th>
              {dates.map((d) => (
                <th key={d} className="min-w-[92px] border-b border-slate-200 px-4 py-3.5 text-center font-bold">
                  {formatDateHeader(d)}
                </th>
              ))}
              <th className="min-w-[120px] border-b border-slate-200 px-4 py-3.5 text-right font-bold">Total Deposit</th>
              <th className="min-w-[120px] border-b border-slate-200 px-4 py-3.5 text-right font-bold">Half Amount</th>
              <th className="min-w-[120px] border-b border-slate-200 px-4 py-3.5 text-right font-bold">Received</th>
              <th className="min-w-[140px] border-b border-slate-200 px-4 py-3.5 text-right font-bold">Deposit Balance</th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((row, idx) => (
              <tr
                key={row.memberId}
                className={`table-row-hover border-b border-slate-100 hover:bg-blue-50/60 ${
                  idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'
                }`}
              >
                <td className="whitespace-nowrap px-4 py-3.5 text-center align-middle tabular-nums text-slate-500">
                  {row.sNo || <span className="text-slate-300">—</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-center align-middle tabular-nums text-slate-500">
                  {row.jNo || <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3.5 text-left align-middle">
                  <Link
                    to={`/users/${row.memberId}`}
                    className="worker-nav-link cursor-pointer font-semibold text-brand-700"
                  >
                    {row.workerName ?? row.name ?? <span className="text-slate-300">—</span>}
                  </Link>
                </td>
                <td className="px-4 py-3.5 text-left align-middle text-slate-600">
                  {row.villageName || <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3.5 text-left align-middle text-slate-600">
                  {row.admin ?? row.createdByWorker ?? <span className="text-slate-300">—</span>}
                </td>

                {dates.map((d) => {
                  const cell = row.cells[d] || { deposit: 0, withdrawal: 0 };
                  const hasData = cell.deposit > 0 || cell.withdrawal > 0;

                  return (
                    <td key={d} className="whitespace-nowrap px-4 py-3.5 text-center align-middle">
                      {hasData ? (
                        <div className="flex flex-col items-end gap-0.5 font-mono tabular-nums leading-tight">
                          {cell.deposit > 0 && (
                            <span className="font-medium text-emerald-600">+{formatMoney(cell.deposit)}</span>
                          )}
                          {cell.withdrawal > 0 && (
                            <span className="text-xs text-amber-600">-{formatMoney(cell.withdrawal)}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  );
                })}

                <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle font-mono font-medium tabular-nums text-slate-900">
                  {formatMoney(row.totalDeposited)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle font-mono tabular-nums text-orange-500">
                  {formatMoney(row.halfAmount)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle font-mono font-semibold tabular-nums text-emerald-600">
                  {formatMoney(row.totalWithdrawn)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle font-mono font-semibold tabular-nums text-amber-600">
                  {formatMoney(row.pendingBalance)}
                </td>
              </tr>
            ))}
          </tbody>

          {displayTotals && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-100/80 font-semibold text-slate-900">
                <td className="px-4 py-3.5 text-left align-middle" colSpan={5}>
                  {selectedVillage || selectedWorker
                    ? `${selectedVillage || ''}${selectedVillage && selectedWorker ? ' / ' : ''}${selectedWorker || ''} Totals`
                    : 'Grand Totals'}
                </td>
                {dates.map((d) => (
                  <td key={d}></td>
                ))}
                <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle font-mono tabular-nums">
                  {formatMoney(displayTotals.totalDeposited)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle font-mono tabular-nums text-slate-600">
                  {formatMoney(displayTotals.halfAmount)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle font-mono font-semibold tabular-nums text-emerald-600">
                  {formatMoney(displayTotals.totalWithdrawn)}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right align-middle font-mono font-semibold tabular-nums text-amber-600">
                  {formatMoney(displayTotals.pendingBalance)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default LedgerTable;
