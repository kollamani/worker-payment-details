import React from 'react';

const colorMap = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
};

const MetricCard = ({ label, value, icon: Icon, color = 'blue' }) => {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${colorMap[color]}`}>
      {Icon && (
        <div className="p-3 rounded-lg bg-white/70">
          <Icon size={22} />
        </div>
      )}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
        <p className="text-xl font-bold text-center">
          {typeof value === 'number'
            ? `${value.toLocaleString('en-IN')}`
            : value}
        </p>
      </div>
    </div>
  );
};

export default MetricCard;
