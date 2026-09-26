import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useAutoLogout — session timeout driven by real user activity.
 *
 * Listens for activity (`mousemove`, `keydown`, `click`, `scroll`,
 * `touchstart` by default) and fires `onLogout()` exactly once after
 * `timeoutInMinutes` (default 10) of total inactivity. Any activity inside
 * the window pushes the deadline back out to a full timeout again.
 *
 * Implementation: activity is just a timestamp write (throttled to at most
 * one per `throttleMs`, so a mousemove storm costs nothing) and a single
 * supervisor interval checks the deadline ~1x/second — no timer churn, and
 * the countdown can never disagree with the logout.
 *
 * `warningSeconds` before the deadline the hook reports `warningOpen: true`
 * plus a live `secondsLeft` so the caller can render a "still there?" dialog.
 * While the warning is open the modal owns focus, so `mousemove`/`scroll` no
 * longer count as activity (pointer drift must not silently restore a full
 * session); any click, keypress or touch still extends it.
 *
 * @param {number|object} options timeout in minutes, or the full option object
 * @returns {{ warningOpen: boolean, secondsLeft: number, extend: () => void }}
 */
const DEFAULT_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
const POINTER_EVENTS = ['mousemove', 'scroll']; // ignored while warning is open
const MIN_TIMEOUT_MS = 5000;
const MIN_WARNING_MS = 1000;

export const useAutoLogout = (options = {}) => {
  const {
    timeoutInMinutes = 10,
    warningSeconds = 60,
    events = DEFAULT_EVENTS,
    throttleMs = 1000,
    enabled = true,
    onLogout,
  } = typeof options === 'number' ? { timeoutInMinutes: options } : options || {};

  const timeoutMs = Math.max(MIN_TIMEOUT_MS, (Number(timeoutInMinutes) || 10) * 60000);
  const warningMs = Math.min(
    Math.max(MIN_WARNING_MS, (Number(warningSeconds) || 60) * 1000),
    timeoutMs - MIN_WARNING_MS,
  );
  const tickMs = Math.max(200, Math.min(Number(throttleMs) || 1000, warningMs, timeoutMs));
  const eventList = events && events.length ? events : DEFAULT_EVENTS;
  const eventKey = eventList.join(',');

  const initialSeconds = Math.ceil(warningMs / 1000);
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  // Single source of truth for "when was the user last here?".
  const lastActivityAtRef = useRef(Date.now());
  const trailingTimerRef = useRef(null);
  const onLogoutRef = useRef(onLogout);
  // Whether the warning is currently shown. A ref (not a closure variable):
  // extend() runs outside the subscription effect but must reset the same
  // flag, otherwise the supervisor would keep taking the "already shown"
  // branch and never re-open the dialog after a "Stay Logged In".
  const warningShownRef = useRef(false);

  // Always call the LATEST onLogout closure without re-subscribing listeners
  // every time a page re-renders.
  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    let active = true; // flipped off on logout: queued ticks never re-fire
    // Declared BEFORE the first tick(): a tab reloaded into inactivity fires
    // the logout from that very first tick, and cleanup() reads this.
    // (`const` here would be a TDZ ReferenceError on exactly that path.)
    let supervisorId = null;

    // Push the deadline back to a full `timeoutMs` from now; cancels warning.
    const armClock = () => {
      lastActivityAtRef.current = Date.now();
      if (warningShownRef.current) {
        warningShownRef.current = false;
        setWarningOpen(false);
      }
    };

    const showWarning = (idleMs) => {
      warningShownRef.current = true;
      setWarningOpen(true);
      setSecondsLeft(Math.max(0, Math.ceil((timeoutMs - idleMs) / 1000)));
    };

    const tick = () => {
      if (!active) return;
      const idleMs = Date.now() - lastActivityAtRef.current;
      if (idleMs >= timeoutMs) {
        // Stop the clock BEFORE handing over: logout resets auth state (and
        // may unmount this subtree), so a tick queued behind it must never
        // fire a second time.
        active = false;
        cleanup();
        if (warningShownRef.current) {
          warningShownRef.current = false;
          setWarningOpen(false);
        }
        onLogoutRef.current?.();
        return;
      }
      if (idleMs >= timeoutMs - warningMs) {
        if (!warningShownRef.current) showWarning(idleMs);
        else setSecondsLeft(Math.max(0, Math.ceil((timeoutMs - idleMs) / 1000)));
      }
    };

    // Leading edge resets instantly; a trailing timer guarantees the last
    // event of a burst still counts, so a whole mousemove storm costs ONE
    // write per throttle window instead of one per event.
    const activityHandler = (event) => {
      if (!active) return;
      // While the warning dialog owns focus, pointer drift must not silently
      // extend the session back to 10 minutes.
      if (warningShownRef.current && POINTER_EVENTS.includes(event?.type)) return;
      if (Date.now() - lastActivityAtRef.current < throttleMs) {
        if (!trailingTimerRef.current) {
          trailingTimerRef.current = window.setTimeout(() => {
            trailingTimerRef.current = null;
            if (active) armClock();
          }, throttleMs);
        }
        return;
      }
      armClock();
    };

    const handleVisible = () => {
      // Background tabs get their interval throttled by the browser:
      // re-check the real timestamp the moment focus returns.
      if (active && document.visibilityState === 'visible') tick();
    };

    const cleanup = () => {
      for (const name of eventList) {
        const target = name === 'scroll' ? window : document;
        target.removeEventListener(name, activityHandler);
      }
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
      if (trailingTimerRef.current) {
        window.clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
      if (supervisorId) window.clearInterval(supervisorId);
    };

    // `scroll` listens on `window` (documents scroll oddly in edge cases);
    // pointer events are passive since the handler never preventDefaults.
    for (const name of eventList) {
      const target = name === 'scroll' ? window : document;
      const opts = POINTER_EVENTS.includes(name) ? { passive: true } : undefined;
      target.addEventListener(name, activityHandler, opts);
    }
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);

    tick(); // a tab reloaded into inactivity warns/locks immediately
    supervisorId = window.setInterval(tick, tickMs);

    return cleanup;
    // Re-wire only when truly reconfigured; the loop runs off refs otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, eventKey, timeoutMs, warningMs, tickMs]);

  // Manual "Stay Logged In" — identical to fresh activity. Resets the same
  // ref the supervisor reads, so the warning re-opens for the next window
  // instead of taking the already-shown branch forever.
  const extend = useCallback(() => {
    lastActivityAtRef.current = Date.now();
    warningShownRef.current = false;
    setWarningOpen(false);
    setSecondsLeft(initialSeconds);
  }, [initialSeconds]);

  return { warningOpen, secondsLeft, extend };
};

export default useAutoLogout;

