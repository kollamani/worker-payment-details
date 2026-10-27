// Persistent dashboard filters — URL as the single source of truth.
//
// The dashboard filter state (search, village, worker, status, date range) is
// *derived* from the URL query string on every render; there is no mirrored
// React state to keep in sync. This removes the previous two-effects design
// (persist state→URL + adopt URL→state) whose read-back raced one commit
// behind and reverted freshly chosen filters (symptom: `?status=done` in the
// URL while the table showed the unfiltered list).
//
// Storage layout on disk: URL query `?search=&village=&worker=&status=&dateFrom=&dateTo=`.
// - Defaults are never written (a filter absent from the URL *is* the default).
// - sessionStorage (`dashboard_active_filters`) is only a seed: if a fresh
//   mount arrives with a URL that carries no filter params, the last user-
//   chosen filters re-enter through the URL once (see below) so in-session
//   stickiness survives tab switches. Reloading `?status=done` always honors
//   the URL, never re-seeding storage over it.
//
// The only paths that mutate anything are `setFilter` (writes URL + cache)
// and `resetFilters` (clears URL + cache + the seed snapshot). Reads are
// pure derivations of `searchParams`, so back/forward and programmatic deep
// links simply work — no reconciliation, no update loops.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isValidDateKey } from '../utils/dates';

export const DASHBOARD_FILTERS_STORAGE_KEY = 'dashboard_active_filters';

export const DASHBOARD_FILTER_DEFAULTS = {
  search: '',
  village: '',
  worker: '',
  status: 'all',
  dateFrom: '',
  dateTo: '',
};

const VALID_STATUSES = ['all', 'done', 'pending'];
const FILTER_KEYS = ['search', 'village', 'worker', 'status', 'dateFrom', 'dateTo'];

const isPlainObject = (value) =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Coerce a candidate filter value into a plain string (or undefined). */
const sanitizeValue = (raw) => {
  if (typeof raw === 'number') return String(raw);
  if (typeof raw !== 'string') return undefined;
  return raw;
};

const validateEntry = (key, raw) => {
  const value = sanitizeValue(raw);
  if (value === undefined) return undefined;
  switch (key) {
    case 'status':
      return VALID_STATUSES.includes(value) ? value : undefined;
    case 'dateFrom':
    case 'dateTo':
      return isValidDateKey(value) ? value : undefined;
    case 'village':
    case 'worker':
      return value.trim() ? value : undefined;
    case 'search':
      return value.slice(0, 200);
    default:
      return undefined;
  }
};

/** Delta of a filters object that differs from the defaults (what gets stored). */
export const stripFilterDefaults = (filters) => {
  const delta = {};
  FILTER_KEYS.forEach((key) => {
    const value = filters?.[key] ?? DASHBOARD_FILTER_DEFAULTS[key];
    if (value !== DASHBOARD_FILTER_DEFAULTS[key]) delta[key] = value;
  });
  return delta;
};

/* Validated delta parsed out of the URL (absent keys are simply not present). */
const parseParams = (searchParams) => {
  const result = {};
  FILTER_KEYS.forEach((key) => {
    const raw = searchParams.get(key);
    if (raw === null) return;
    const value = validateEntry(key, raw);
    if (value !== undefined) result[key] = value;
  });
  return result;
};

const readFromStorage = () => {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(DASHBOARD_FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    const clean = {};
    FILTER_KEYS.forEach((key) => {
      const value = validateEntry(key, parsed[key]);
      if (value !== undefined) clean[key] = value;
    });
    return clean;
  } catch {
    return null;
  }
};

const writeStorage = (delta) => {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (Object.keys(delta).length > 0) {
      sessionStorage.setItem(DASHBOARD_FILTERS_STORAGE_KEY, JSON.stringify(delta));
    } else {
      sessionStorage.removeItem(DASHBOARD_FILTERS_STORAGE_KEY);
    }
  } catch {
    /* storage disabled — URL persistence still works */
  }
};

/**
 * Dashboard filter state backed by URL search params.
 *
 * @returns {{
 *   filters: typeof DASHBOARD_FILTER_DEFAULTS,
 *   setFilter: (key: string, value: string) => void,
 *   resetFilters: () => void,
 * }}
 */
export const useDashboardFilters = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // One-time mount snapshot: does the URL already carry filters, and what
  // (if anything) should be re-seeded from the session cache? Captured before
  // any effect can mutate either source.
  const initialRef = useRef(null);
  if (initialRef.current === null) {
    initialRef.current = {
      urlHadFilters: FILTER_KEYS.some((key) => searchParams.get(key) !== null),
      cacheSeed: readFromStorage(),
    };
  }
  const [cacheSeed, setCacheSeed] = useState(initialRef.current.cacheSeed);

  // Active filters: pure derivation of the URL; the cache seed only supplies
  // keys the URL never got to cover (fresh navigation without any params).
  const filters = useMemo(
    () => ({
      ...DASHBOARD_FILTER_DEFAULTS,
      ...(cacheSeed || {}),
      ...parseParams(searchParams),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams, cacheSeed]
  );

  // Reflect a cache-seeded mount into the URL once, so the seeded filters are
  // deep-linkable and every later diff against the URL stays exact. The seed
  // snapshot is dropped immediately afterwards — from that point the URL alone
  // decides, so back/forward behaves predictably (no sticker keys resurrect).
  useEffect(() => {
    if (initialRef.current.urlHadFilters) return;
    const delta = stripFilterDefaults(filters);
    if (Object.keys(delta).length > 0) {
      setSearchParams(new URLSearchParams(delta), { replace: true });
    }
    setCacheSeed(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFilter = useCallback(
    (key, value) => {
      if (!FILTER_KEYS.includes(key)) return;
      const validated = validateEntry(key, value);

      // Compute the next full filter set, then write both sources:
      // the URL becomes the authoritative params; the cache mirrors the
      // non-default delta for fresh-navigation seeding.
      const next = { ...filters, [key]: validated ?? DASHBOARD_FILTER_DEFAULTS[key] };
      if (next[key] === filters[key]) return; // no-op change → no URL churn

      const delta = stripFilterDefaults(next);
      writeStorage(delta);
      setSearchParams(new URLSearchParams(delta), { replace: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, setSearchParams]
  );

  const resetFilters = useCallback(() => {
    writeStorage({});
    setCacheSeed(null);
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  return useMemo(
    () => ({ filters, setFilter, resetFilters }),
    [filters, setFilter, resetFilters]
  );
};
