import React, { useEffect, useRef } from 'react';
import { AlarmClock, LogOut } from 'lucide-react';

/**
 * IdleWarningModal — subtle "you will be logged out" dialog.
 *
 * Rendered by AuthProvider when `useAutoLogout` reports `warningOpen`.
 * Same shell as ConfirmModal (`bg-surface`, `border-line`, text-ink* tokens,
 * `animate-modal-pop` / `animate-modal-backdrop`), so it follows the active
 * light/dark theme for free.
 *
 *   • `secondsLeft` is a live countdown fed by the hook's supervisor tick.
 *   • "Stay Logged In" is auto-focused and also answers the Enter key;
 *      Escape extends too, so a stray hand never confirms a logout by mistake.
 *   • `role="alertdialog"` + `aria-modal` + `aria-live` announce the pending
 *      logout to screen readers.
 *
 * Pointer input lands on the dialog's own buttons, and any click/key/touch
 * reaching the page handlers also resets the hook's clock — so closing the
 * dialog by ANY means counts as activity.
 */
const IdleWarningModal = ({ open, secondsLeft = 60, onStay, onLogoutNow }) => {
  const stayButtonRef = useRef(null);

  // Move focus into the dialog while it is open (dismissal returns focus to
  // whatever had it — the button is removed, so the browser falls back
  // gracefully instead of stranding focus on a detached node).
  useEffect(() => {
    if (open) stayButtonRef.current?.focus?.();
  }, [open ]);

  // Enter/"Stay" keeps the session; Escape also extends (never logs out).
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onStay?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onStay]);

  if (!open) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-[1px] animate-modal-backdrop dark:bg-black/60 sm:p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-warning-title"
        aria-describedby="idle-warning-message"
        className="my-auto w-[95%] max-w-sm overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-xl animate-modal-pop sm:p-6"
      >
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-full bg-amber-50 p-2 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <AlarmClock size={20} aria-hidden="true" />
          </div>
          <h3 id="idle-warning-title" className="text-lg font-semibold text-ink">
            Still there?
          </h3>
        </div>

        <p id="idle-warning-message" className="mb-2 text-sm text-ink-soft">
          You will be logged out due to inactivity in{' '}
          <span className="font-semibold tabular-nums text-ink" aria-live="polite">
            {minutes > 0 ? `${minutes}:${secs}` : `${secondsLeft}s`}
          </span>
          .
        </p>

        {/* Progress bar: drains as the logout deadline approaches. */}
        <div
          className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-subtle"
          role="progressbar"
          aria-label="Time remaining before automatic logout"
          aria-valuenow={secondsLeft}
        >
          <div
            className="h-full rounded-full bg-amber-500 transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.min(100, Math.max(0, (secondsLeft / 60) * 100))}%` }}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={onLogoutNow}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong px-4 py-2 text-sm text-ink-soft hover:bg-subtle hover:text-ink sm:w-auto"
          >
            <LogOut size={15} aria-hidden="true" /> Log Out Now
          </button>
          <button
            type="button"
            ref={stayButtonRef}
            onClick={onStay}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:w-auto"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
};

export default IdleWarningModal;

