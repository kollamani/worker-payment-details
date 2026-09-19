import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

// Screen-centred result popup auto-dismisses after 3 seconds (per spec).
const TOAST_DURATION_MS = 3000;

const TOAST_THEMES = {
  success: {
    title: 'Success',
    Icon: CheckCircle2,
    badgeClass: 'bg-emerald-100',
    iconClass: 'text-emerald-600',
    borderClass: 'border-emerald-200',
    barClass: 'bg-emerald-500',
  },
  error: {
    title: 'Action Failed',
    Icon: XCircle,
    badgeClass: 'bg-red-100',
    iconClass: 'text-red-600',
    borderClass: 'border-red-200',
    barClass: 'bg-red-500',
  },
  info: {
    title: 'Notification',
    Icon: Info,
    badgeClass: 'bg-indigo-100',
    iconClass: 'text-indigo-600',
    borderClass: 'border-indigo-200',
    barClass: 'bg-indigo-500',
  },
};

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hideToast = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const showToast = useCallback(
    (message, type = 'success', title = '') => {
      clearTimer();
      const theme = TOAST_THEMES[type] || TOAST_THEMES.success;
      const id = Date.now();
      setToast({ id, message, type, title: title || theme.title });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setToast((current) => (current?.id === id ? null : current));
      }, TOAST_DURATION_MS);
    },
    [clearTimer]
  );

  // Escape closes the popup immediately.
  useEffect(() => {
    if (!toast) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') hideToast();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toast, hideToast]);

  // Never leave a dangling timer after unmount.
  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ showToast, hideToast }), [showToast, hideToast]);

  const theme = toast ? TOAST_THEMES[toast.type] || TOAST_THEMES.success : null;
  const ThemeIcon = theme?.Icon;

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toast && theme && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
          <div
            role={toast.type === 'error' ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            className={`w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl animate-toast-pop ${theme.borderClass}`}
          >
            <div className="flex flex-col items-center px-6 pb-5 pt-7 text-center">
              <div className={`flex h-16 w-16 items-center justify-center rounded-full ${theme.badgeClass}`}>
                <ThemeIcon size={36} strokeWidth={2} className={theme.iconClass} />
              </div>
              <h2 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">{toast.title}</h2>
              <p className="mt-1.5 break-words text-sm leading-relaxed text-slate-600">{toast.message}</p>
              <button
                type="button"
                onClick={hideToast}
                className="mt-5 inline-flex min-w-32 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
                aria-label="Close notification"
              >
                OK <X size={15} />
              </button>
            </div>
            {/* Countdown bar: visually tracks the 3s auto-dismiss. */}
            <div className="h-1 w-full bg-slate-100">
              <div className={`h-full animate-toast-timer ${theme.barClass}`} />
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
};
