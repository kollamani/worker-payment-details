/*
 * Hardened HTTP security headers for the Financial Ledger stack.
 *
 * Built on Helmet 8 (https://helmetjs.github.io/) plus the pieces Helmet does
 * not cover: Permissions-Policy, Reporting-Endpoints, Cache-Control for
 * sensitive JSON responses and Content-Security-Policy nonce generation.
 *
 * THIS MODULE IS THE SINGLE SOURCE OF TRUTH FOR THE POLICY.
 * Two profiles exist:
 *   'api' -> served by Express for https://worker-payment-details.onrender.com
 *   'spa' -> the statically hosted React app on https://worker-payment-details.vercel.app
 * The static configs (frontend/vercel.json, frontend/public/_headers and
 * deploy/nginx/financial-ledger.conf) are asserted against this module by
 * tests/security-headers.test.js so they can not drift.
 *
 * Print the canonical values to paste into those configs:
 *   node scripts/verify-security-headers.js --print
 * Compute CSP hashes for any inline <script>/<style> in a built HTML file:
 *   node scripts/verify-security-headers.js --hashes ../frontend/dist/index.html
 *
 * Environment knobs (all optional, safe defaults):
 *   CSP_MODE            enforce | report-only | off        (default enforce)
 *   CSP_REPORT_URI      collector URL -> enables report-uri/report-to
 *   CSP_NONCE           true only when Express itself renders the HTML shell
 *   HSTS_ENABLED        default true when NODE_ENV=production
 *   HSTS_MAX_AGE        default 63072000 (2 years); clamped to >= 31536000
 *   HSTS_INCLUDE_SUBDOMAINS   default true
 *   HSTS_PRELOAD        default false (read the prerequisites in docs/SECURITY-HEADERS.md)
 *   API_CORP            cross-origin | same-site | same-origin (default cross-origin)
 *   API_CACHE_CONTROL   default "no-store, no-cache, must-revalidate, private"
 *   PERMISSIONS_POLICY  full header override
 *   SPA_CONNECT_SRC     space/comma separated extra origins for the SPA policy
 */
const crypto = require('crypto');
const helmet = require('helmet');

/* ------------------------------------------------------------------ *
 * Small env helpers
 * ------------------------------------------------------------------ */

const warned = new Set();
const warnOnce = (message) => {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[security-headers] ${message}`);
};

const flag = (name, fallback = false) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
};

const list = (raw, fallback = []) => {
  if (!raw) return fallback;
  const parsed = String(raw)
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
};

/* ------------------------------------------------------------------ *
 * Canonical values
 * ------------------------------------------------------------------ */

const CSP_MODES = ['enforce', 'report-only', 'off'];
const REPORT_GROUP = 'csp-endpoint';

// The preload list refuses anything below one year; two years is the norm.
const HSTS_MIN_MAX_AGE = 31536000;
const DEFAULT_HSTS_MAX_AGE = 63072000;

const DEFAULT_API_ORIGINS = ['https://worker-payment-details.onrender.com'];

const CACHE_CONTROL_HEADERS = {
  'Cache-Control': process.env.API_CACHE_CONTROL || 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
  Expires: '0',
};

// Deny everything; nothing in this product needs a powerful browser API.
// Override with PERMISSIONS_POLICY=... if a feature is ever added on purpose.
const PERMISSIONS_POLICY =
  process.env.PERMISSIONS_POLICY ||
  [
    'accelerometer=()',
    'ambient-light-sensor=()',
    'autoplay=()',
    'battery=()',
    'camera=()',
    'clipboard-read=()',
    'clipboard-write=()',
    'display-capture=()',
    'document-domain=()',
    'encrypted-media=()',
    'fullscreen=()',
    'gamepad=()',
    'geolocation=()',
    'gyroscope=()',
    'hid=()',
    'idle-detection=()',
    'magnetometer=()',
    'microphone=()',
    'midi=()',
    'payment=()',
    'picture-in-picture=()',
    'publickey-credentials-get=()',
    'screen-wake-lock=()',
    'serial=()',
    'speaker-selection=()',
    'sync-xhr=()',
    'usb=()',
    'web-share=()',
    'xr-spatial-tracking=()',
  ].join(', ');

/* ------------------------------------------------------------------ *
 * HSTS
 * ------------------------------------------------------------------ */

const resolveHstsMaxAge = () => {
  const parsed = Number.parseInt(process.env.HSTS_MAX_AGE || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_HSTS_MAX_AGE;
  if (parsed < HSTS_MIN_MAX_AGE) {
    warnOnce(
      `HSTS_MAX_AGE=${parsed} is below the 1 year minimum accepted by the preload list; using ${HSTS_MIN_MAX_AGE}.`
    );
    return HSTS_MIN_MAX_AGE;
  }
  return parsed;
};

const hstsOptions = () => ({
  maxAge: resolveHstsMaxAge(),
  includeSubDomains: flag('HSTS_INCLUDE_SUBDOMAINS', true),
  preload: flag('HSTS_PRELOAD', false),
});

// Never emit HSTS from a plaintext development server: it would poison the
// developer's browser for localhost or any other host that shares the name.
const hstsEnabled = () => flag('HSTS_ENABLED', process.env.NODE_ENV === 'production');

const hstsHeaderValue = () => {
  const { maxAge, includeSubDomains, preload } = hstsOptions();
  let value = `max-age=${maxAge}`;
  if (includeSubDomains) value += '; includeSubDomains';
  if (preload) value += '; preload';
  return value;
};

/* ------------------------------------------------------------------ *
 * Content-Security-Policy
 * ------------------------------------------------------------------ */

const cspMode = () => {
  const raw = String(process.env.CSP_MODE || '').trim().toLowerCase();
  if (!raw) return 'enforce';
  if (!CSP_MODES.includes(raw)) {
    warnOnce(`Unknown CSP_MODE "${raw}"; falling back to enforce.`);
    return 'enforce';
  }
  return raw;
};

const connectSrcForSpa = () =>
  ["'self'", ...list(process.env.SPA_CONNECT_SRC, DEFAULT_API_ORIGINS)];

/*
 * API profile - the API only ever returns JSON, so nothing may load at all.
 * `sandbox` is a no-op for a JSON body, but neutralises the whole document if a
 * response ever renders as HTML by accident (see docs/SECURITY-HEADERS.md).
 */
const API_CSP_DIRECTIVES = {
  'default-src': ["'none'"],
  'base-uri': ["'none'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'none'"],
  'script-src': ["'none'"],
  'style-src': ["'none'"],
  'img-src': ["'none'"],
  'font-src': ["'none'"],
  'connect-src': ["'none'"],
  'media-src': ["'none'"],
  'worker-src': ["'none'"],
  'manifest-src': ["'none'"],
  'frame-src': ["'none'"],
  'child-src': ["'none'"],
  sandbox: [],
};

/*
 * SPA profile - strict, and achievable without 'unsafe-inline' or nonces
 * because the Vite production build emits exactly two external resources
 * (one hashed module script and one hashed stylesheet) and no inline
 * script/style: verified against frontend/dist/index.html.
 *
 *   - script-src 'self'     : no 'unsafe-inline', no 'unsafe-eval', no CDN
 *   - script-src-attr 'none': inline event handlers (onclick=) are dead
 *   - style-src 'self'      : the app uses Tailwind classes only (no style={{}}
 *   - connect-src           : only the API origin(s), configured via env
 *   - frame-ancestors 'none': clickjacking defence (X-Frame-Options kept too)
 *   - object-src/base-uri/form-action: plugin, <base> hijack and form hijack defence
 */
const SPA_CSP_DIRECTIVES = () => ({
  'default-src': ["'none'"],
  'base-uri': ["'none'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
  'script-src': ["'self'"],
  'script-src-elem': ["'self'"],
  'script-src-attr': ["'none'"],
  'style-src': ["'self'"],
  'style-src-elem': ["'self'"],
  'style-src-attr': ["'none'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'connect-src': connectSrcForSpa(),
  'media-src': ["'none'"],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'frame-src': ["'none'"],
  'child-src': ["'none'"],
  'upgrade-insecure-requests': [],
});

// Only used when Express itself renders the HTML shell (CSP_NONCE=true).
// 'strict-dynamic' is deliberately NOT used: it would ignore 'self' and break
// Vite's <link rel="modulepreload"> hints, which cannot carry a nonce.
const spaDirectivesWithNonce = (nonce) => {
  const directives = SPA_CSP_DIRECTIVES();
  directives['script-src'] = ["'self'", `'nonce-${nonce}'`];
  directives['script-src-elem'] = ["'self'", `'nonce-${nonce}'`];
  return directives;
};

const buildCspDirectives = ({ profile = 'api', nonce = null } = {}) => {
  const directives =
    profile === 'spa' ? (nonce ? spaDirectivesWithNonce(nonce) : SPA_CSP_DIRECTIVES()) : API_CSP_DIRECTIVES;
  const reportUri = String(process.env.CSP_REPORT_URI || '').trim();
  if (!reportUri) return directives;
  return { ...directives, 'report-uri': [reportUri], 'report-to': [REPORT_GROUP] };
};

// Same serialisation Helmet uses, exposed so the static configs can be
// generated from (and asserted against) this single source of truth.
const serializeCsp = (directives) =>
  Object.entries(directives)
    .map(([name, values]) => (values && values.length ? `${name} ${values.join(' ')}` : name))
    .join('; ');

// Browsers pick the last value they understand: modern browsers use
// strict-origin-when-cross-origin, older ones fall back to no-referrer.
const REFERRER_POLICY = ['no-referrer', 'strict-origin-when-cross-origin'];

const resolveCorp = () => {
  const raw = String(process.env.API_CORP || 'cross-origin').trim().toLowerCase();
  if (!['cross-origin', 'same-site', 'same-origin'].includes(raw)) {
    warnOnce(`Unknown API_CORP "${raw}"; falling back to same-origin.`);
    return 'same-origin';
  }
  return raw;
};

/* ------------------------------------------------------------------ *
 * Middleware
 * ------------------------------------------------------------------ */

// Everything Helmet can set in one shot. CSP is applied separately because it
// has to honour CSP_MODE (enforce / report-only / off) and optional nonces.
const baseHelmetOptions = (profile = 'api') => ({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: { policy: 'require-corp' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  // The API is intentionally readable from the SPA origin (CORS still gates it);
  // the SPA origin itself must not let other sites embed its documents.
  crossOriginResourcePolicy: { policy: profile === 'spa' ? 'same-origin' : resolveCorp() },

  referrerPolicy: { policy: REFERRER_POLICY },
  strictTransportSecurity: hstsEnabled() ? hstsOptions() : false,
  frameguard: { action: 'deny' },
  xContentTypeOptions: true,
  xDnsPrefetchControl: { allow: false },
  xDownloadOptions: true,
  xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
  xPoweredBy: true,
  xXssProtection: true,
  originAgentCluster: true,
});

const permissionsPolicyMiddleware = (req, res, next) => {
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  const reportUri = String(process.env.CSP_REPORT_URI || '').trim();
  if (reportUri) {
    res.setHeader('Reporting-Endpoints', `${REPORT_GROUP}="${reportUri}"`);
  }
  next();
};

const contentSecurityPolicyFor = (profile) => {
  const mode = cspMode();
  if (mode === 'off') {
    warnOnce('CSP is disabled (CSP_MODE=off). Never run this way in production.');
    return (req, res, next) => next();
  }

  const reportOnly = mode === 'report-only';

  if (profile === 'spa' && flag('CSP_NONCE')) {
    // Per-request nonce: only meaningful when Express renders the HTML shell.
    return (req, res, next) => {
      const nonce = crypto.randomBytes(16).toString('base64');
      res.locals.cspNonce = nonce;
      helmet.contentSecurityPolicy({
        useDefaults: false,
        directives: buildCspDirectives({ profile, nonce }),
        reportOnly,
      })(req, res, next);
    };
  }

  return helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: buildCspDirectives({ profile }),
    reportOnly,
  });
};

/**
 * Express middleware bundle. Mount FIRST so that 404/500 responses inherit the
 * same hardening as successful ones.
 *   app.use(securityHeaders());        // API profile
 *   app.use(securityHeaders('spa'));   // only if Express serves the HTML shell
 */
const securityHeaders = (profile = 'api') => [
  helmet(baseHelmetOptions(profile)),
  permissionsPolicyMiddleware,
  contentSecurityPolicyFor(profile),
];

/* ------------------------------------------------------------------ *
 * Cache-Control for sensitive responses
 * ------------------------------------------------------------------ */

/**
 * Ledger data must never be stored by a browser, a shared proxy or a CDN.
 * Mount BEFORE the routes so successful responses are covered too:
 *   app.use('/api', apiNoStore);
 * A route can still opt out by calling res.setHeader afterwards.
 */
const apiNoStore = (req, res, next) => {
  Object.entries(CACHE_CONTROL_HEADERS).forEach(([name, value]) => res.setHeader(name, value));
  next();
};

/* ------------------------------------------------------------------ *
 * Canonical snapshot for the non-Express edges + exports
 * ------------------------------------------------------------------ */

/**
 * Header values for the static/CDN edges (Vercel, Cloudflare, Netlify, nginx).
 * Do not hand-edit those files: tests/security-headers.test.js fails when they
 * drift from this snapshot.
 */
const headerPolicySnapshot = ({ profile = 'spa' } = {}) => ({
  'Content-Security-Policy': serializeCsp(buildCspDirectives({ profile })),
  'Strict-Transport-Security': hstsHeaderValue(),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': REFERRER_POLICY.join(', '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': profile === 'api' ? resolveCorp() : 'same-origin',
  'Permissions-Policy': PERMISSIONS_POLICY,
  'Origin-Agent-Cluster': '?1',
  'X-DNS-Prefetch-Control': 'off',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-Download-Options': 'noopen',
  'X-XSS-Protection': '0',
});

module.exports = {
  securityHeaders,
  apiNoStore,
  buildCspDirectives,
  serializeCsp,
  headerPolicySnapshot,
  hstsHeaderValue,
  cacheControlHeaders: CACHE_CONTROL_HEADERS,
  permissionsPolicyHeader: PERMISSIONS_POLICY,
  API_CSP_DIRECTIVES,
  SPA_CSP_DIRECTIVES,
  CSP_MODES,
  REPORT_GROUP,
};



