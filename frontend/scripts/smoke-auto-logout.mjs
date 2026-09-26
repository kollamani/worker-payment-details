/*
 * Smoke test for auto-logout on inactivity. Dependency-free (no jsdom/jest):
 * the real hook is bundled with esbuild (`react` -> tiny hook dispatcher)
 * and driven against a fake clock + document/window; the real warning modal
 * is bundled for server-rendering and once more with a captured JSX runtime
 * so its buttons can be clicked headlessly.
 * Run: node scripts/smoke-auto-logout.mjs  (from the frontend folder)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import React from 'react';
import { renderToString } from 'react-dom/server';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const HOOK_PATH = path.join(root, 'src', 'hooks', 'useAutoLogout.js');
const MODAL_PATH = path.join(root, 'src', 'components', 'IdleWarningModal.jsx');
const AUTH_PATH = path.join(root, 'src', 'context', 'AuthContext.jsx');
const LOGIN_PATH = path.join(root, 'src', 'pages', 'Login.jsx');
const AXIOS_PATH = path.join(root, 'src', 'api', 'axios.js');
const HOOK_BUNDLE = path.join(root, 'node_modules', '.smoke-auto-logout-hook.cjs');
const MODAL_BUNDLE = path.join(root, 'node_modules', '.smoke-auto-logout-modal.cjs');
const CAPTURE_BUNDLE = path.join(root, 'node_modules', '.smoke-auto-logout-capture.cjs');
const CAPTURE_KEY = '__capturedIdleWarningModalJsx';

const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra && !cond ? ` — ${extra}` : ''}`);
};

// ── Fake world: clock, timers, listeners ────────────────────────────────────
const world = { now: 1000000, timers: [], nextId: 1, doc: {}, win: {}, timeouts: 0 };
const clearTimer = (id) => {
  const t = world.timers.find((x) => x.id === id);
  if (t) t.cleared = true;
};
const makeTarget = (store) => ({
  addEventListener: (type, cb) => { if (typeof cb === 'function') (store[type] ||= []).push(cb); },
  removeEventListener: (type, cb) => { store[type] = (store[type] || []).filter((l) => l !== cb); },
});

function makeWorldTarget(kind) {
  return {
    addEventListener: (type, cb) => {
      if (typeof cb !== 'function') return;
      const store = kind === 'win' ? world.win : world.doc;
      (store[type] ||= []).push(cb);
    },
    removeEventListener: (type, cb) => {
      const store = kind === 'win' ? world.win : world.doc;
      store[type] = (store[type] || []).filter((l) => l !== cb);
    },
  };
}

const windowStub = {
  ...makeWorldTarget('win'),
  setTimeout: (cb, ms) => { world.timeouts += 1; return regTimer('timeout', cb, ms); },
  clearTimeout: clearTimer,
  setInterval: (cb, ms) => regTimer('interval', cb, ms),
  clearInterval: clearTimer,
};
function regTimer(kind, cb, ms) {
  const t = { id: world.nextId++, kind, cb, ms, at: world.now + ms, next: world.now + ms, cleared: false };
  world.timers.push(t);
  return t.id;
}
const documentStub = { ...makeWorldTarget('doc'), visibilityState: 'visible' };

const realNow = Date.now;
Date.now = () => world.now;
globalThis.window = windowStub;
globalThis.document = documentStub;

function resetWorld() {
  world.now = 1000000;
  world.timers = [];
  world.doc = {};
  world.win = {};
  world.timeouts = 0;
  documentStub.visibilityState = 'visible';
}

const fireDoc = (type, event) => [...(world.doc[type] || [])].forEach((cb) => cb(event || { type }));
const fireWin = (type, event) => [...(world.win[type] || [])].forEach((cb) => cb(event || { type }));

function advance(ms, step = 250) {
  const end = world.now + ms;
  while (world.now < end) {
    world.now = Math.min(world.now + step, end);
    for (const t of [...world.timers]) {
      if (!t.cleared && t.kind === 'timeout' && t.at <= world.now) { t.cleared = true; t.cb(); }
    }
    for (const t of [...world.timers]) {
      if (t.cleared || t.kind !== 'interval') continue;
      let guard = 0;
      while (t.next <= world.now && guard++ < 100000) { t.cb(); t.next += t.ms; }
    }
  }
}

// ── Minimal React dispatcher: the bundled hook runs headlessly ──────────────
// render() re-invokes the hook like a re-render: state slots persist, effects
// re-run only when deps change (cleanups included), destroy() unmounts.
const SHIM_SRC = [
  'let current = null;',
  'const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length',
  '  && a.every((v, i) => Object.is(v, b[i]));',
  'function useSlot(init) { const inst = current; const i = inst.cursor++;',
  '  if (!inst.slots[i]) inst.slots[i] = init(); return inst.slots[i]; }',
  'export function useState(init) {',
  '  const s = useSlot(() => ({ value: typeof init === "function" ? init() : init }));',
  '  const set = (v) => { s.value = typeof v === "function" ? v(s.value) : v; };',
  '  return [s.value, set]; }',
  'export function useRef(init) { return useSlot(() => ({ current: init })); }',
  'export function useCallback(fn, deps) {',
  '  const s = useSlot(() => ({ fn, deps }));',
  '  const prev = s.deps;',
  '  const eq = Array.isArray(prev) && Array.isArray(deps) && prev.length === deps.length',
  '    && prev.every((v, i) => Object.is(v, deps[i]));',
  '  if (!eq) { s.fn = fn; s.deps = Array.isArray(deps) ? deps.slice() : deps; }',
  '  return s.fn; }',
  'export function __create() { return { slots: [], cursor: 0, pending: [] }; }',
  'export function __render(inst, fn, props) {',
  '  current = inst; inst.cursor = 0; inst.pending = [];',
  '  const r = fn(props);',
  '  const work = inst.pending; inst.pending = [];',
  '  for (const s of work) { const c = s.run(); s.cleanup = typeof c === "function" ? c : undefined; }',
  '  current = null; return r; }',
  'export function __destroy(inst) {',
  '  for (const s of inst.slots) {',
  '    if (s && s.hasRun && typeof s.cleanup === "function") { try { s.cleanup(); } catch (e) {} } }',
  '  inst.slots = []; }',
  'export function useEffect(fn, deps) {',
  '  const s = useSlot(() => ({ hasRun: false, deps: undefined, cleanup: undefined, run: null }));',
  '  if (!s.hasRun || !same(s.deps, deps)) {',
  '    if (s.hasRun && typeof s.cleanup === "function") { try { s.cleanup(); } catch (e) {} }',
  '    s.deps = Array.isArray(deps) ? deps.slice() : deps; s.hasRun = true; s.run = fn;',
  '    current.pending.push(s); } }',
  'globalThis.__reactShim = { __create, __render, __destroy };',
  'export default { useState, useRef, useCallback, useEffect };',
].join('\n');

await esbuild.build({
  entryPoints: [HOOK_PATH],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: HOOK_BUNDLE,
  logLevel: 'silent',
  plugins: [{
    name: 'react-shim',
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react-shim', namespace: 'shim' }));
      build.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({ loader: 'js', contents: SHIM_SRC }));
    },
  }],
});

const hookMod = require(HOOK_BUNDLE);
const useAutoLogout = hookMod.useAutoLogout || hookMod.default;
const shim = globalThis.__reactShim;
check('hook bundle exports useAutoLogout', typeof useAutoLogout === 'function');

const renderHook = (props = {}) => {
  const inst = shim.__create();
  const api = { current: null };
  const invoke = (p) => { api.current = shim.__render(inst, useAutoLogout, p); return api.current; };
  invoke(props);
  return { api, invoke, destroy: () => shim.__destroy(inst) };
};

// Scenario 1 — 10 idle minutes -> fires onLogout exactly once, no warning.
{
  resetWorld();
  let calls = 0;
  const h = renderHook({ timeoutInMinutes: 10, warningSeconds: 60, tickMs: 1000, onLogout: () => { calls += 1; } });
  advance(8.5 * 60000);
  h.invoke({ timeoutInMinutes: 10, warningSeconds: 60, tickMs: 1000, onLogout: () => { calls += 1; } });
  check('no logout before the 10th minute', calls === 0, `calls=${calls}`);
  check('no warning before the 9th minute', h.api.current.warningOpen === false);
  advance(90000); // minute 10 -> deadline
  h.invoke({ timeoutInMinutes: 10, warningSeconds: 60, tickMs: 1000, onLogout: () => { calls += 1; } });
  check('onLogout fires on total inactivity', calls === 1, `calls=${calls}`);
  advance(5 * 60000); // queued ticks after logout must never re-fire
  check('onLogout fires exactly once', calls === 1, `calls=${calls}`);
  h.destroy();
}

// Scenario 2 — 60s warning window, extend() cancels the logout.
{
  resetWorld();
  let calls = 0;
  const h = renderHook({ timeoutInMinutes: 10, warningSeconds: 60, tickMs: 1000, onLogout: () => { calls += 1; } });
  advance(9 * 60000 + 5000);
  h.invoke({ timeoutInMinutes: 10, warningSeconds: 60, tickMs: 1000, onLogout: () => { calls += 1; } });
  const w = h.api.current;
  check('warning opens at the 9th minute', w.warningOpen === true);
  check('countdown is ~55s', w.secondsLeft >= 54 && w.secondsLeft <= 56, `got ${w.secondsLeft}`);
  w.extend(); // user clicks "Stay Logged In"
  h.invoke({ timeoutInMinutes: 10, warningSeconds: 60, tickMs: 1000, onLogout: () => { calls += 1; } });
  advance(9 * 60000);
  h.invoke({ timeoutInMinutes: 10, warningSeconds: 60, tickMs: 1000, onLogout: () => { calls += 1; } });
  check('extending resets the clock (no logout, warning re-arms)', calls === 0 && h.api.current.warningOpen === true);
  h.destroy();
}

// Scenario 3 — activity inside the window pushes the deadline back out.
{
  resetWorld();
  let calls = 0;
  const props = { timeoutInMinutes: 10, warningSeconds: 60, tickMs: 1000, onLogout: () => { calls += 1; } };
  const h = renderHook(props);
  for (let m = 0; m < 19; m += 1) {
    advance(60000);
    fireDoc('keydown'); // keeps touching the clock just before the warning
    h.invoke(props);
  }
  check('steady activity prevents logout for 19 minutes', calls === 0, `calls=${calls}`);
  advance(10 * 60000 + 2000);
  h.invoke(props);
  check('stopping activity eventually logs out', calls === 1, `calls=${calls}`);
  h.destroy();
}

// Scenario 4 — mousemove storm is throttled (1s window), trailing edge keeps
// the last event; unmount removes every listener and timer.
{
  resetWorld();
  let calls = 0;
  const h = renderHook({ timeoutInMinutes: 10, warningSeconds: 60, tickMs: 1000, onLogout: () => { calls += 1; } });
  for (let i = 0; i < 600; i += 1) fireDoc('mousemove');
  check(
    '600-event burst collapses to at most 2 setTimeouts',
    world.timeouts <= 2,
    `timeouts=${world.timeouts}`,
  );
  h.destroy();
  const leftovers =
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].reduce((n, t) => n + (world.doc[t] || []).length, 0)
    + (world.win.scroll || []).length
    + (world.doc.visibilitychange || []).length
    + (world.win.focus || []).length
    + world.timers.filter((t) => !t.cleared).length;
  check('unmount cleans up listeners and timers', leftovers === 0, `leftover=${leftovers}`);
}

// Scenario 5 — number shorthand wires the same 10-minute timeout; a disabled
// hook arms nothing.
{
  resetWorld();
  const h = renderHook(10);
  advance(9 * 60000 + 5000);
  h.invoke(10);
  check('useAutoLogout(10) shorthand warns at the 9th minute', h.api.current.warningOpen === true);
  h.destroy();

  resetWorld();
  let calls2 = 0;
  const h2 = renderHook({ enabled: false, timeoutInMinutes: 10, onLogout: () => { calls2 += 1; } });
  advance(11 * 60000, 1000);
  h2.invoke({ enabled: false, timeoutInMinutes: 10, onLogout: () => { calls2 += 1; } });
  const armed =
    Object.keys(world.doc).length + Object.keys(world.win).length
    + world.timers.filter((t) => !t.cleared).length;
  check('enabled=false arms no listeners/timers and never logs out', calls2 === 0 && armed === 0, `calls=${calls2} armed=${armed}`);
  h2.destroy();
}

// Scenario 6 — pointer drift while the warning is open must NOT extend the
// session; a real click still does.
{
  resetWorld();
  let calls = 0;
  const props = { timeoutInMinutes: 10, warningSeconds: 60, tickMs: 1000, onLogout: () => { calls += 1; } };
  const h = renderHook(props);
  advance(9 * 60000 + 5000);
  h.invoke(props);
  check('warning is open', h.api.current.warningOpen === true);
  fireDoc('mousemove'); // resting hand — must be ignored
  fireWin('scroll'); // trackpad drift — must be ignored
  advance(55000);
  h.invoke(props);
  check('pointer drift during warning still logs out', calls === 1, `calls=${calls}`);
  h.destroy();

  resetWorld();
  let calls3 = 0;
  const p3 = { timeoutInMinutes: 10, warningSeconds: 60, tickMs: 1000, onLogout: () => { calls3 += 1; } };
  const h3 = renderHook(p3);
  advance(9 * 60000 + 5000);
  h3.invoke(p3);
  fireDoc('click'); // deliberate — cancels the warning
  advance(30000);
  h3.invoke(p3);
  check('click during warning cancels logout', calls3 === 0 && h3.api.current.warningOpen === false);
  h3.destroy();
}

// ── Warning modal: rendered HTML + headless button driving ───────────────────
await esbuild.build({
  entryPoints: [MODAL_PATH],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: MODAL_BUNDLE,
  logLevel: 'silent',
  jsx: 'automatic',
  jsxDev: true,
  external: ['react', 'react-dom', 'lucide-react', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
});

const ModalMod = require(MODAL_BUNDLE);
const IdleWarningModal = ModalMod.default || ModalMod;

const modalHtml = renderToString(React.createElement(IdleWarningModal, {
  open: true, secondsLeft: 42, onStay: () => {}, onLogoutNow: () => {},
}));
check('modal renders an alertdialog', modalHtml.includes('role="alertdialog"'));
check('modal shows the live countdown', modalHtml.includes('42'));
check('modal offers Stay Logged In + Log Out Now',
  modalHtml.includes('Stay Logged In') && modalHtml.includes('Log Out Now'));
const closedHtml = renderToString(React.createElement(IdleWarningModal, { open: false }));
check('closed modal renders nothing', closedHtml.trim() === '');

// Capture-shimmed bundle: click the real buttons and assert the handlers fire.
// A proper functional lucide icon (not `() => null`) keeps react-dom/server's
// host-element walk happy; type names drive the assertion, not pixels.
globalThis[CAPTURE_KEY] = [];
await esbuild.build({
  entryPoints: [MODAL_PATH],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: CAPTURE_BUNDLE,
  logLevel: 'silent',
  jsx: 'automatic',
  jsxDev: true,
  external: ['react', 'react-dom', 'lucide-react', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  plugins: [{
    name: 'capture-jsx-runtime',
    setup(build) {
      build.onResolve({ filter: /^react\/jsx(-dev)?-runtime$/ }, (args) =>
        (args.namespace === 'capture' ? null : { path: 'jsx-runtime-capture', namespace: 'capture' }));
      build.onLoad({ filter: /.*/, namespace: 'capture' }, () => ({
        loader: 'js',
        contents: [
          `const runtime = require('react/jsx-dev-runtime');`,
          `const record = (create) => function (...args) {`,
          `  const el = create(...args);`,
          `  (globalThis.${CAPTURE_KEY} ||= []).push(el);`,
          `  return el;`,
          `};`,
          `module.exports = { ...runtime, jsx: record(runtime.jsx), jsxs: record(runtime.jsxs), jsxDEV: record(runtime.jsxDEV) };`,
          `Object.defineProperty(module.exports, '__esModule', { value: true });`,
        ].join('\n'),
      }));
      build.onResolve({ filter: /^lucide-react$/ }, () => ({ path: 'lucide-stub', namespace: 'stub' }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        loader: 'js',
        contents: [
          `const React = require('react');`,
          `const icon = (name) => {`,
          `  const Icon = (props) => React.createElement('svg', { ...props, 'data-lucide': name });`,
          `  Icon.displayName = name;`,
          `  return Icon;`,
          `};`,
          // __esModule + a live named-export binding: esbuild's __toESM then
          // resolves `import { AlarmClock }` to the icon instead of undefined.
          `const handler = { get: (_t, name) => icon(String(name)) };`,
          `const proxy = new Proxy({}, handler);`,
          `Object.defineProperty(module.exports, '__esModule', { value: true });`,
          `module.exports.default = proxy;`,
          `for (const key of ['AlarmClock', 'LogOut']) module.exports[key] = icon(key);`,
          `module.exports = new Proxy(module.exports, {`,
          `  get: (t, name) => (name in t ? t[name] : icon(String(name))),`,
          `});`,
        ].join('\n'),
      }));
    },
  }],
});

const CaptureMod = require(CAPTURE_BUNDLE);
const CaptureModal = CaptureMod.default || CaptureMod;
globalThis[CAPTURE_KEY] = [];
renderToString(React.createElement(CaptureModal, {
  open: true, secondsLeft: 30, onStay: () => { globalThis.__stayed = true; },
  onLogoutNow: () => { globalThis.__loggedOut = true; },
}));
const findButton = (label) =>
  (globalThis[CAPTURE_KEY] || []).find((el) =>
    el && el.type === 'button' && JSON.stringify(el.props?.children || '').includes(label));
const stayBtn = findButton('Stay Logged In');
const logoutBtn = findButton('Log Out Now');
check('both buttons are real <button> elements', !!stayBtn && !!logoutBtn);
globalThis.__stayed = false;
stayBtn?.props?.onClick?.();
check('Stay Logged In calls onStay', globalThis.__stayed === true);
globalThis.__loggedOut = false;
logoutBtn?.props?.onClick?.();
check('Log Out Now calls onLogoutNow', globalThis.__loggedOut === true);

// ── Static wiring: nothing in the hand-written integration may drift ─────────
const authSrc = fs.readFileSync(AUTH_PATH, 'utf8');
const loginSrc = fs.readFileSync(LOGIN_PATH, 'utf8');
const apiSrc = fs.readFileSync(AXIOS_PATH, 'utf8');
const hookSrc = fs.readFileSync(HOOK_PATH, 'utf8');

check('AuthContext wires the hook at 10 min / 60 s warning',
  authSrc.includes('useAutoLogout') && authSrc.includes('timeoutInMinutes: 10')
  && authSrc.includes('warningSeconds: 60') && authSrc.includes('enabled: !!token'));
check('AuthContext idle logout clears auth + navigates to /login',
  authSrc.includes("logout('idle')") && authSrc.includes("navigate('/login'"));
check('AuthContext renders IdleWarningModal with hook state',
  authSrc.includes('<IdleWarningModal') && authSrc.includes('warningOpen') && authSrc.includes('secondsLeft'));
check('Login shows the inactivity notice and clears the one-shot flag',
  loginSrc.includes('logged out due to inactivity') && loginSrc.includes('ledger_logout_reason'));
check('axios 401 path tags the server-driven reason flag',
  apiSrc.includes('markServerSessionExpired') && apiSrc.includes('skipAuthRedirect'));
check('hook listens to all five required activity events',
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].every((e) => hookSrc.includes(`'${e}'`)));
check('listeners are removed and timers cleared on cleanup',
  hookSrc.includes('removeEventListener') && hookSrc.includes('clearInterval')
  && hookSrc.includes('clearTimeout') && /return cleanup;/.test(hookSrc));

// ── Summary ──────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
Date.now = realNow;
if (failed.length > 0) process.exit(1);



