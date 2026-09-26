import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Theme context with three modes — light, dark and system (follow the OS).
 *
 * - The user's preference is persisted in localStorage under THEME_STORAGE_KEY
 *   so it survives a page refresh.
 * - The resolved theme is applied to <html> as the `dark` class (Tailwind's
 *   class-based dark mode) plus the `color-scheme` property, so native controls
 *   (date pickers, scrollbars, select popups) follow along too.
 * - When the preference is "system", an OS-level scheme change re-renders the
 *   app live via matchMedia's change event.
 * - index.html runs a tiny inline bootstrap script with the same logic before
 *   first paint, which is what prevents a light/dark flash on refresh.
 */
export const THEME_STORAGE_KEY = 'ledger_theme';

export const THEME_PREFERENCES = ['light', 'dark', 'system'];

const THEME_META_COLORS = { light: '#f8fafc', dark: '#020617' };

// Safe storage access: localStorage may be unavailable (SSR / private mode /
// disabled cookies), so every touch is guarded to avoid a hard crash — the
// same defensive pattern used by AuthContext.
const safeStorage = {
  get: (key) => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
      /* storage full / disabled — non-fatal, the theme still applies for this session */
    }
  },
};

/** Only known values are accepted; anything else falls back to "system". */
export const normalizeThemePreference = (value) =>
  THEME_PREFERENCES.includes(value) ? value : 'system';

/** Current OS-level color scheme ("light" when matchMedia is unavailable). */
export const getSystemTheme = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  // Read the persisted preference once, on mount (never throws — see safeStorage).
  const [preference, setPreferenceState] = useState(() =>
    normalizeThemePreference(safeStorage.get(THEME_STORAGE_KEY))
  );
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  // What the user actually sees right now.
  const resolvedTheme = preference === 'system' ? systemTheme : preference;

  // Apply the resolved theme to the document. Toggling the class is what
  // activates every `dark:` utility and the `.dark` CSS variable overrides.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_META_COLORS[resolvedTheme] || THEME_META_COLORS.light);
  }, [resolvedTheme]);

  // Track OS scheme changes so "System" mode stays live (and so the first
  // paint of a fresh visit resolves correctly even before any user choice).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => setSystemTheme(event.matches ? 'dark' : 'light');

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handleChange);
      return () => query.removeEventListener('change', handleChange);
    }
    // Safari < 14 only supports the deprecated listener API.
    query.addListener(handleChange);
    return () => query.removeListener(handleChange);
  }, []);

  /** Persist and apply a new preference ("light" | "dark" | "system"). */
  const setPreference = useCallback((next) => {
    const value = normalizeThemePreference(next);
    setPreferenceState(value);
    safeStorage.set(THEME_STORAGE_KEY, value);
  }, []);

  // Convenience cycle used by simple click-to-toggle buttons:
  // light → dark → system → light.
  const cyclePreference = useCallback(() => {
    setPreferenceState((current) => {
      const index = THEME_PREFERENCES.indexOf(normalizeThemePreference(current));
      const next = THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length];
      safeStorage.set(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      systemTheme,
      isDark: resolvedTheme === 'dark',
      setPreference,
      cyclePreference,
      setLight: () => setPreference('light'),
      setDark: () => setPreference('dark'),
      setSystem: () => setPreference('system'),
    }),
    [preference, resolvedTheme, systemTheme, setPreference, cyclePreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};

export default ThemeContext;
