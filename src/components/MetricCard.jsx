import React from 'react';

// Accent tiles switch to their 950 background / 300 text pair in dark mode so
// the icon chips keep a clear figure/ground separation on slate-900 cards.
const accentMap = {
  blue: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
};

const MetricCard = ({ label, value, icon: Icon, color = 'blue' }) => {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wider text-ink-muted">{label}</p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-ink">
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
