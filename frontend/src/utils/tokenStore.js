/*
 * Remember-me aware token storage.
 *
 *  - "Remember me" ON  → token lives in localStorage  (survives browser restarts)
 *  - "Remember me" OFF → token lives in sessionStorage (cleared when the tab closes)
 *
 * Only the non-sensitive remember flag is persisted in localStorage so boot
 * knows which compartment to read first; reading order is always
 * localStorage → sessionStorage, and logout clears BOTH so no stale token
 * can survive a session switch.
 */

const TOKEN_KEY = 'ledger_token';
const ADMIN_KEY = 'ledger_admin';
const REMEMBER_KEY = 'ledger_remember';

const read = (storage, key) => {
  try {
    if (typeof storage === 'undefined' || storage === null) return null;
    return storage.getItem(key);
  } catch {
    /* storage disabled / private mode — treat as absent */
    return null;
  }
};

const write = (storage, key, value) => {
  try {
    if (typeof storage === 'undefined' || storage === null) return;
    storage.setItem(key, value);
  } catch {
    /* storage full / disabled — non-fatal */
  }
};

const remove = (storage, key) => {
  try {
    if (typeof storage === 'undefined' || storage === null) return;
    storage.removeItem(key);
  } catch {
    /* non-fatal */
  }
};

export const getToken = () => read(localStorage, TOKEN_KEY) || read(sessionStorage, TOKEN_KEY);

export const getAdmin = () => {
  const raw = read(localStorage, ADMIN_KEY) || read(sessionStorage, ADMIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Tampered/corrupt JSON must not crash the app on boot — drop it.
    clearTokens();
    return null;
  }
};

export const isRemembered = () => read(localStorage, REMEMBER_KEY) === 'true';

/**
 * Persist the session. `remember` decides the storage compartment:
 * true → localStorage (persistent), false → sessionStorage (per-tab).
 */
export const setTokens = ({ token, admin, remember = true }) => {
  // Clean both compartments first so switching the remember flag never
  // leaves a duplicate (or conflicting) session behind.
  clearTokens();

  write(localStorage, REMEMBER_KEY, remember ? 'true' : 'false');
  const compartment = remember ? localStorage : sessionStorage;
  write(compartment, TOKEN_KEY, token);
  write(compartment, ADMIN_KEY, JSON.stringify(admin));
};

export const setAdmin = (admin) => {
  const compartment = isRemembered() ? localStorage : sessionStorage;
  write(compartment, ADMIN_KEY, JSON.stringify(admin));
};

export const clearTokens = () => {
  [localStorage, sessionStorage].forEach((storage) => {
    remove(storage, TOKEN_KEY);
    remove(storage, ADMIN_KEY);
  });
};
