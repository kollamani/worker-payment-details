import React from 'react';

const accentMap = {
  blue: 'bg-indigo-50 text-indigo-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
};

const MetricCard = ({ label, value, icon: Icon, color = 'blue' }) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {typeof value === 'number'
              ? `${value.toLocaleString('en-IN')}`
              : value}
          </p>
        </div>
        {Icon && (
          <div className={`shrink-0 rounded-lg p-2.5 ${accentMap[color]}`}>
            <Icon size={20} strokeWidth={2} className="opacity-80" />
          </div>
        )}
      </div>
    </div>
  );
};

export default MetricCard;
