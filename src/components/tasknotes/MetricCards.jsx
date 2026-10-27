import React from 'react';
import Sparkline from './Sparkline';
import { formatINR, safeAmount } from '../../utils/financialMetrics';

/**
 * Status segment pills rendered directly above the summary card grid. They are
 * real filters (All / Pending / Completed) applied to the task board below.
 * The selected pill inverts (dark fill / light text in light mode, light fill /
 * dark text in dark mode) so its state is obvious without relying on colour
 * alone — aria-selected carries the same information for assistive tech.
 */
export const SegmentPills = ({ segments = [], active, onChange }) => (
  <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter tasks by status">
    {segments.map((segment) => {
      const isActive = active === segment.key;
      return (
        <button
          key={segment.key}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(segment.key)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
            isActive
              ? 'border-ink bg-surface text-ink shadow-sm ring-2 ring-ink/10 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-100/10'
              : 'border-line bg-surface/70 text-ink-muted hover:bg-surface hover:text-ink'
          }`}
        >
          {segment.label}
          <span
            className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
              isActive ? 'bg-ink text-surface' : 'bg-subtle text-ink-soft'
            }`}
          >
            {segment.count}
          </span>
        </button>
      );
    })}
  </div>
);

/**
 * Top summary card — always visible, one per category bucket. Pastel gradient,
 * icon tile, live task-count chip, the bucket formula as the subtitle and a
 * miniature sparkline of the bucket's cumulative running total.
 * The gradient `tint` and `iconTint` come from the page and each include a
 * `dark:` pair, so the card keeps its identity in both themes.
 */
export const SummaryCard = ({
  label,
  formula,
  count = 0,
  value,
  icon: Icon,
  tint,
  iconTint,
  series,
  stroke = '#0f172a',
  toneWhenNegative = false,
}) => {
  const amount = safeAmount(value);
  const taskCount = safeAmount(count);
  const tone = toneWhenNegative && amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-ink';
  return (
    <article
      className={`rounded-2xl border border-line bg-gradient-to-br p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${tint}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTint}`}>
          <Icon size={17} strokeWidth={2.2} />
        </span>
        <span className="rounded-full bg-surface/80 px-2 py-1 font-mono text-[10px] font-semibold tabular-nums text-ink-muted ring-1 ring-line/70">
          {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
        </span>
      </div>
      <p className="mt-3 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{label}</p>
      <p className={`mt-1 whitespace-nowrap font-mono text-2xl font-bold tabular-nums ${tone}`}>{formatINR(amount)}</p>
      <p className="mt-1 truncate text-[11px] font-medium text-ink-muted" title={formula}>
        {formula}
      </p>
      <div className="mt-3 h-8 w-full" title={`${label} — cumulative running total`}>
        <Sparkline values={series} stroke={stroke} className="h-8 w-full" />
      </div>
    </article>
  );
};

/**
 * Futures card — deliberately darker (slate/indigo gradient on light text) so
 * the projected section reads as a clearly distinct view of the ledger. The
 * same dark panel works as a high-contrast accent on light canvases and blends
 * naturally with dark-mode surfaces.
 */
export const FuturesCard = ({ label, formula, value, icon: Icon, accentText = 'text-emerald-300', toneWhenNegative = false }) => {
  const amount = safeAmount(value);
  const tone = toneWhenNegative && amount < 0 ? 'text-rose-300' : accentText;
  return (
    <article className="rounded-2xl border border-indigo-400/20 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-indigo-400/30">
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-indigo-200">
          <Icon size={17} strokeWidth={2.2} />
        </span>
        <span
          className="max-w-[70%] truncate rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-indigo-200"
          title={formula}
        >
          {formula}
        </span>
      </div>
      <p className="mt-3 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-200/80">{label}</p>
      <p className={`mt-1 whitespace-nowrap font-mono text-2xl font-bold tabular-nums ${tone}`}>{formatINR(amount)}</p>
    </article>
  );
};

/**
 * Collapsible Futures grid — smooth height/opacity transition via the
 * grid-rows-[0fr -> 1fr] technique (no fixed heights, no layout jump), and
 * fully hidden (visually and from the accessibility tree) while closed.
 */
export const FuturesGrid = ({ open, panelId, children }) => (
  <div
    id={panelId}
    role="region"
    aria-label="Futures financial projection"
    aria-hidden={!open}
    className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${
      open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 invisible'
    }`}
  >
    <div className="min-h-0 overflow-hidden">
      <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/40 sm:p-4">{children}</div>
    </div>
  </div>
);
