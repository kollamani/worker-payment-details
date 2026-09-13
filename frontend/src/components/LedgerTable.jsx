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
  villages = [],
  workers = [],
  selectedVillage,
  setSelectedVillage,
  selectedWorker,
  setSelectedWorker,
  searchTerm,
  setSearchTerm,
  selectedDate,
}) => {
  const visibleRows = (rows || []).filter((row) => {
    const term = (searchTerm || '').trim().toLowerCase();
    if (!term) return true;
    return (
      row.name?.toLowerCase().includes(term) ||
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
        <div className="text-center py-16 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
          No transactions found for {new Date(selectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.
        </div>
      );
    }

    return (
      <div className="text-center py-16 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
        No members or transactions yet. Add a member and record a transaction to see the ledger sheet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 border-b border-gray-200 bg-gray-50">
        <div className="relative flex-1 max-w-md">
          <input
            value={searchTerm || ''}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by member name or J.No..."
            className="w-full pl-3 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 min-w-[480px]">
          <div className="min-w-[220px]">
            <select
              value={selectedVillage || ''}
              onChange={(e) => setSelectedVillage(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="">All Villages</option>
              {villages.map((village) => (
                <option key={village} value={village}>
                  {village}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[220px]">
            <select
              value={selectedWorker || ''}
              onChange={(e) => setSelectedWorker(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="">All Workers</option>
              {workers.map((worker) => (
                <option key={worker} value={worker}>
                  {worker}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto whitespace-nowrap">
        <table className="min-w-full table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-blue-700 text-white text-xs uppercase tracking-wide">
              <th className="px-3 py-3 text-center font-bold min-w-[60px] border border-blue-800">S.No</th>
              <th className="px-3 py-3 text-center font-bold min-w-[80px] border border-blue-800">J.No</th>
              <th className="px-3 py-3 text-left font-bold min-w-[180px] border border-blue-800">Member Name</th>
              <th className="px-3 py-3 text-left font-bold min-w-[120px] border border-blue-800">Village Name</th>
              <th className="px-3 py-3 text-left font-bold min-w-[180px] border border-blue-800">Worker</th>
              {dates.map((d) => (
                <th key={d} className="px-3 py-3 text-center font-bold min-w-[100px] border border-blue-800">
                  {formatDateHeader(d)}
                </th>
              ))}
              <th className="px-3 py-3 text-center font-bold min-w-[120px] border border-blue-800">Total Deposit</th>
              <th className="px-3 py-3 text-center font-bold min-w-[120px] border border-blue-800">Half Amount</th>
              <th className="px-3 py-3 text-center font-bold min-w-[120px] border border-blue-800">Received</th>
              <th className="px-3 py-3 text-center font-bold min-w-[120px] border border-blue-800">Pending</th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((row, idx) => (
              <tr key={row.memberId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 text-center align-middle text-gray-700 border border-gray-200">{row.sNo}</td>
                <td className="px-3 py-2 text-center align-middle text-gray-700 font-medium border border-gray-200">
                  {row.jNo}
                </td>
                <td className="px-3 py-2 text-left align-middle border border-gray-200">
                  <Link to={`/users/${row.memberId}`} className="text-brand-700 hover:underline font-medium">
                    {row.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-left align-middle text-gray-600 border border-gray-200">
                  {row.villageName || '—'}
                </td>
                <td className="px-3 py-2 text-left align-middle text-gray-700 font-medium border border-gray-200">
                  {row.createdByWorker || '—'}
                </td>

                {dates.map((d) => {
                  const cell = row.cells[d] || { deposit: 0, withdrawal: 0 };
                  const hasData = cell.deposit > 0 || cell.withdrawal > 0;

                  return (
                    <td key={d} className="px-3 py-2 text-center align-middle border border-gray-200 whitespace-nowrap">
                      {hasData ? (
                        <div className="flex flex-col items-center justify-center leading-tight">
                          {cell.deposit > 0 && (
                            <span className="text-green-700 font-medium">+{formatMoney(cell.deposit)}</span>
                          )}
                          {cell.withdrawal > 0 && (
                            <span className="text-amber-700 text-xs">-{formatMoney(cell.withdrawal)}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}

                <td className="px-3 py-2 text-center align-middle font-semibold text-gray-800 border border-gray-200 whitespace-nowrap">
                  {formatMoney(row.totalDeposited)}
                </td>
                <td className="px-3 py-2 text-center align-middle text-gray-600 border border-gray-200 whitespace-nowrap">
                  {formatMoney(row.halfAmount)}
                </td>
                <td className="px-3 py-2 text-center align-middle text-amber-700 border border-gray-200 whitespace-nowrap">
                  {formatMoney(row.totalWithdrawn)}
                </td>
                <td
                  className={`px-3 py-2 text-center align-middle font-semibold border border-gray-200 whitespace-nowrap ${
                    row.pendingBalance > 0 ? 'text-red-600' : 'text-green-700'
                  }`}
                >
                  {formatMoney(row.pendingBalance)}
                </td>
              </tr>
            ))}
          </tbody>

          {displayTotals && (
            <tfoot>
              <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                <td className="px-3 py-3 text-left align-middle font-bold border border-gray-300" colSpan={5}>
                  {selectedVillage || selectedWorker
                    ? `${selectedVillage || ''}${selectedVillage && selectedWorker ? ' / ' : ''}${selectedWorker || ''} Totals`
                    : 'Grand Totals'}
                </td>
                {dates.map((d) => (
                  <td key={d} className="border border-gray-300"></td>
                ))}
                <td className="px-3 py-3 text-center align-middle border border-gray-300 whitespace-nowrap">
                  {formatMoney(displayTotals.totalDeposited)}
                </td>
                <td className="px-3 py-3 text-center align-middle border border-gray-300 whitespace-nowrap">
                  {formatMoney(displayTotals.halfAmount)}
                </td>
                <td className="px-3 py-3 text-center align-middle border border-gray-300 text-amber-700 whitespace-nowrap">
                  {formatMoney(displayTotals.totalWithdrawn)}
                </td>
                <td className="px-3 py-3 text-center align-middle border border-gray-300 text-red-600 whitespace-nowrap">
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
