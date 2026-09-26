import React, { useRef } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { THEME_PREFERENCES, useTheme } from '../context/ThemeContext';

/**
 * Accessible Light / Dark / System segmented control.
 *
 * - Implemented as a WAI-ARIA radiogroup: one tab stop per option with
 *   aria-checked state, plus Left/Right (and Up/Down) arrow-key navigation
 *   and roving focus, per the ARIA radio-group pattern.
 * - Every option shows a visible focus ring, an explicit accessible name
 *   ("Use dark theme") and a tooltip, so the control never relies on the icon
 *   alone to convey state.
 * - The selected segment is filled with brand-600 + white text (5.2:1), the
 *   idle segments use ink-muted on surface (5.0:1 light / 7.2:1 dark), keeping
 *   contrast at or above WCAG AA in both themes.
 */
const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun, description: 'Always use the light theme' },
  { value: 'dark', label: 'Dark', Icon: Moon, description: 'Always use the dark theme' },
  { value: 'system', label: 'System', Icon: Monitor, description: 'Match the operating system theme' },
];

const ThemeToggle = ({ className = '', showLabels = false, variant = 'panel' }) => {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const groupRef = useRef(null);

  const handleKeyDown = (event, index) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const nextIndex = forward
      ? (index + 1) % OPTIONS.length
      : (index - 1 + OPTIONS.length) % OPTIONS.length;
    setPreference(OPTIONS[nextIndex].value);
    const buttons = groupRef.current?.querySelectorAll('[role="radio"]');
    buttons?.[nextIndex]?.focus();
  };

  const panelClasses =
    variant === 'panel'
      ? 'border-line bg-surface p-1 shadow-sm'
      : 'border-line/70 bg-subtle/70 p-0.5';

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Color theme"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border ${panelClasses} ${className}`}
    >
      {OPTIONS.map(({ value, label, Icon, description }, index) => {
        const active = preference === value;
        const title =
          value === 'system'
            ? `Theme: System (currently ${resolvedTheme})`
            : `Theme: ${label}`;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`Use ${label.toLowerCase()} theme`}
            title={`${title} — ${description}`}
            onClick={() => setPreference(value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 focus-visible:ring-offset-surface dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-surface ${
              showLabels ? 'px-2.5 py-1.5 text-xs font-semibold' : 'h-7 w-7'
            } ${
              active
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-ink-muted hover:bg-subtle hover:text-ink'
            }`}
          >
            <Icon size={14} aria-hidden="true" />
            {showLabels ? <span>{label}</span> : null}
            {/* Spoken-only state hint for icon-only mode. */}
            {!showLabels ? <span className="sr-only">{active ? '(selected)' : ''}</span> : null}
          </button>
        );
      })}
    </div>
  );
};

export const THEME_TOGGLE_OPTIONS = THEME_PREFERENCES;

export default ThemeToggle;
