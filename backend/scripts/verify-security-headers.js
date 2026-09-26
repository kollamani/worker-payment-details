#!/usr/bin/env node
/*
 * Security header auditor for the Financial Ledger stack.
 *
 * Modes
 *   (default)                 boot the local Express app on an ephemeral port
 *                             and audit its real responses
 *   --url <origin>            audit a deployed origin (API or SPA)
 *   --profile api|spa         expected policy (default: api)
 *   --print                   print the canonical header values used by the
 *                             static configs (vercel.json / _headers / nginx)
 *   --hashes <file.html>      sha256 hashes for any inline <script>/<style>,
 *                             i.e. exactly what a CSP needs instead of
 *                             'unsafe-inline'
 *   --json                    machine readable output
 *   --help
 *
 * Examples
 *   node scripts/verify-security-headers.js
 *   node scripts/verify-security-headers.js --url https://worker-payment-details.onrender.com
 *   node scripts/verify-security-headers.js --url https://worker-payment-details.vercel.app --profile spa
 *   node scripts/verify-security-headers.js --hashes ../frontend/dist/index.html
 *
 * Exit code 1 when a required header is missing or wrong, so it can gate CI.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const { headerPolicySnapshot } = require('../middleware/securityHeaders');

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback) => {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  const next = argv[index + 1];
  return next && !next.startsWith('--') ? next : fallback;
};

if (has('--help') || has('-h')) {
  console.log(
    [
      'Audit HTTP security headers.',
      '',
      '  node scripts/verify-security-headers.js [--url <origin>] [--profile api|spa] [--json]',
      '  node scripts/verify-security-headers.js --print [--profile api|spa] [--format json|lines]',
      '  node scripts/verify-security-headers.js --hashes <file.html>',
    ].join('\n')
  );
  process.exit(0);
}

const asJson = has('--json');
const profile = (valueOf('--profile', 'api') || 'api').toLowerCase();
if (!['api', 'spa'].includes(profile)) {
  console.error(`Unknown --profile "${profile}" (expected api or spa).`);
  process.exit(2);
}
const targetUrl = valueOf('--url', null);

// Discouraged/removed headers that must NOT come back.
const FORBIDDEN = [
  ['x-powered-by', /.*/, 'framework disclosure'],
  ['x-aspnet-version', /.*/, 'framework disclosure'],
  ['x-aspnetmvc-version', /.*/, 'framework disclosure'],
  ['x-xss-protection', /mode=block/, 'legacy XSS auditor re-enabled'],
  ['server-timing', /.*/, 'potential timing/disclosure'],
];

// Present on managed platforms and not removable by application config.
const PLATFORM_MANAGED = ['server', 'cf-ray', 'x-vercel-id', 'x-render-origin-server', 'rndr-id', 'x-vercel-cache', 'cf-cache-status'];

const OK = 'ok';
const FAIL = 'fail';
const WARN = 'warn';

// Extra expectations that are not part of the canonical snapshot.
const EXTRA_EXPECTATIONS = {
  api: [
    ['cache-control', /no-store/i, 'sensitive JSON responses must not be cacheable'],
    ['pragma', /no-cache/i, 'HTTP/1.0 proxies must not cache'],
  ],
  spa: [['cache-control', /no-cache|max-age=0/i, 'the HTML shell must revalidate']],
};

const norm = (value) =>
  String(value === undefined || value === null ? '' : value)
    .replace(/\s+/g, ' ')
    .replace(/\s*;\s*/g, '; ')
    .replace(/\s*,\s*/g, ', ')
    .trim();

/* ------------------------------------------------------------------ *
 * HTTP probe
 * ------------------------------------------------------------------ */

// fetch() is avoided on purpose: its keep-alive sockets race with process exit
// (libuv assertion on Windows) and hide the exact header spelling we audit.
const head = (url) =>
  new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(
      url,
      { agent: false, headers: { accept: '*/*', 'user-agent': 'financial-ledger-header-audit/1.0', connection: 'close' } },
      (res) => {
        const store = new Map();
        Object.entries(res.headers).forEach(([key, value]) => {
          store.set(key.toLowerCase(), Array.isArray(value) ? value.join(', ') : value);
        });
        res.resume();
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: {
              get: (name) => {
                const found = store.get(String(name).toLowerCase());
                return found === undefined ? null : found;
              },
            },
          })
        );
      }
    );
    req.setTimeout(20000, () => req.destroy(new Error('request timed out after 20s')));
    req.on('error', reject);
  });

/* ------------------------------------------------------------------ *
 * --print : canonical values for the static/CDN configs
 * ------------------------------------------------------------------ */

const printPolicy = () => {
  const policy = headerPolicySnapshot({ profile });
  if (asJson || valueOf('--format', 'json') === 'json') {
    console.log(JSON.stringify({ profile, headers: policy }, null, 2));
    return;
  }
  Object.entries(policy).forEach(([name, value]) => console.log(`${name}: ${value}`));
};

/* ------------------------------------------------------------------ *
 * --hashes : sha256 tokens for inline scripts/styles (CSP without unsafe-inline)
 * ------------------------------------------------------------------ */

const printHashes = (file) => {
  const html = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
  const collect = (regex) =>
    [...html.matchAll(regex)]
      .map((match) => match[1])
      .filter((body) => body && body.trim().length > 0)
      .map((body) => `'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`);

  const inlineScripts = collect(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi);
  const inlineStyles = collect(/<style\b[^>]*>([\s\S]*?)<\/style>/gi);
  const nonceAttrs = (html.match(/\bnonce=/gi) || []).length;

  const report = {
    file: path.resolve(file),
    inlineScripts: inlineScripts.length,
    inlineStyles: inlineStyles.length,
    nonceAttributes: nonceAttrs,
    scriptHashes: inlineScripts,
    styleHashes: inlineStyles,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Inline <script> blocks : ${report.inlineScripts}`);
  console.log(`Inline <style> blocks  : ${report.inlineStyles}`);
  console.log(`nonce="" attributes    : ${report.nonceAttributes}`);
  if (!inlineScripts.length && !inlineStyles.length) {
    console.log(
      '\nNo inline scripts or styles found. A nonce/hash is NOT required:\n' +
        "script-src 'self' and style-src 'self' are already sufficient (this is the\n" +
        'canonical SPA policy). Re-run this after any change to frontend/index.html.'
    );
    return;
  }
  if (inlineScripts.length) console.log(`\nscript-src 'self' ${inlineScripts.join(' ')}`);
  if (inlineStyles.length) console.log(`style-src 'self' ${inlineStyles.join(' ')}`);
  console.log('\nHashes break on every content change: prefer moving the code into a file.');
};

/* ------------------------------------------------------------------ *
 * Audit
 * ------------------------------------------------------------------ */

const expectedPolicy = headerPolicySnapshot({ profile });

// These two are audited by requirement rather than by exact string, because
// managed platforms legitimately add tokens (e.g. Vercel appends "; preload" to
// HSTS) and because an equivalent referrer value is just as safe.
const EXACT_EXEMPT = new Set(['strict-transport-security', 'referrer-policy']);

const evaluate = (headers) => {
  const results = [];

  Object.entries(expectedPolicy).forEach(([name, expected]) => {
    if (EXACT_EXEMPT.has(name.toLowerCase())) return;
    const actual = headers.get(name);
    results.push({ name, expected, actual, status: actual !== null && norm(actual) === norm(expected) ? OK : FAIL });
  });

  const sts = headers.get('Strict-Transport-Security');
  const stsMaxAge = sts === null ? NaN : Number.parseInt((/max-age=(\d+)/i.exec(sts) || [])[1], 10);
  results.push({
    name: 'Strict-Transport-Security - max-age at least 1 year (31536000)',
    expected: 'max-age=31536000 or more',
    actual: sts,
    status: sts !== null && Number.isFinite(stsMaxAge) && stsMaxAge >= 31536000 ? OK : FAIL,
  });
  results.push({
    name: 'Strict-Transport-Security - includeSubDomains',
    expected: 'includeSubDomains',
    actual: sts,
    status: sts !== null && /includeSubDomains/i.test(sts) ? OK : FAIL,
  });
  if (sts !== null && /preload/i.test(sts)) {
    results.push({
      name: 'Strict-Transport-Security - preload token present',
      expected: 'only valid on a domain you fully control',
      actual: sts,
      status: WARN,
    });
  }

  const referrer = headers.get('Referrer-Policy');
  results.push({
    name: 'Referrer-Policy - no-referrer or strict-origin-when-cross-origin, never unsafe-url',
    expected: 'no-referrer | strict-origin-when-cross-origin',
    actual: referrer,
    status:
      referrer !== null && !/unsafe-url/i.test(referrer) && /(no-referrer|strict-origin-when-cross-origin)/i.test(referrer) ? OK : FAIL,
  });

  (EXTRA_EXPECTATIONS[profile] || []).forEach(([name, regex, why]) => {
    const actual = headers.get(name);
    results.push({
      name: `${name} - ${why}`,
      expected: String(regex),
      actual,
      status: actual !== null && regex.test(actual) ? OK : FAIL,
    });
  });

  FORBIDDEN.forEach(([name, regex, why]) => {
    const actual = headers.get(name);
    results.push({
      name: `${name} - ${why}`,
      expected: 'absent',
      actual,
      status: actual !== null && regex.test(actual) ? FAIL : OK,
    });
  });

  PLATFORM_MANAGED.forEach((name) => {
    const actual = headers.get(name);
    if (actual !== null) {
      results.push({ name: `${name} - set by the hosting platform`, expected: 'not removable here', actual, status: WARN });
    }
  });

  return results;
};

const renderText = (url, httpStatus, results) => {
  const width = Math.max(...results.map((row) => row.name.length), 28);
  console.log(`\nAuditing ${url} (HTTP ${httpStatus}, profile: ${profile})\n`);
  results.forEach((row) => {
    const badge = row.status === OK ? 'PASS' : row.status === WARN ? 'WARN' : 'FAIL';
    console.log(`  [${badge}] ${row.name.padEnd(width)} ${row.status === OK ? '' : `got: ${row.actual === null ? '<missing>' : row.actual}`}`.trimEnd());
  });
  const failed = results.filter((row) => row.status === FAIL);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed, ${failed.length} failed.`);
  if (failed.length) {
    console.log('\nTo fix:');
    failed.forEach((row) =>
      console.log(`  - ${row.name}\n      expected: ${row.expected}\n      actual:   ${row.actual === null ? '<missing>' : row.actual}`)
    );
    console.log('\nSee docs/SECURITY-HEADERS.md (deployment snippets + rollout plan).');
  }
  return failed.length;
};

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

const startLocalApp = async () => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  const app = require('../app');
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const main = async () => {
  if (has('--print')) {
    printPolicy();
    return 0;
  }
  if (valueOf('--hashes', null)) {
    printHashes(valueOf('--hashes', null));
    return 0;
  }

  let origin = targetUrl;
  let close = async () => {};
  if (!origin) {
    const local = await startLocalApp();
    origin = local.origin;
    close = local.close;
    if (!asJson) {
      console.log('No --url given: auditing a locally booted instance of the real app (no database needed).');
    }
  }

  const base = origin.replace(/\/+$/, '');
  const url = profile === 'api' ? `${base}/api/health` : `${base}/`;

  let exitCode = 0;
  try {
    const res = await head(url);
    const results = evaluate(res.headers);
    const failed = results.filter((row) => row.status === FAIL).length;
    if (asJson) {
      console.log(JSON.stringify({ url, httpStatus: res.status, profile, failed, results }, null, 2));
    } else {
      renderText(url, res.status, results);
      if (res.status >= 300 && res.status < 400) {
        console.log('\nNote: the target redirected. Re-run against the final HTTPS origin to audit the real response.');
      }
    }
    exitCode = failed === 0 ? 0 : 1;
  } finally {
    await close();
  }
  return exitCode;
};

main()
  .then((code) => {
    // Set the code instead of calling process.exit(): exiting while sockets are
    // still closing trips a libuv assertion on Windows.
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`\nAudit could not complete: ${err.message}`);
    console.error('Is the target reachable, and is --url pointing at an origin (not a path)?');
    process.exitCode = 2;
  });
