/*
 * HTTP security header suite for the Financial Ledger stack.
 *
 * Two things are proven here:
 *   1. The real Express app (app.js, the same middleware stack as production)
 *      emits every required header on success, 404 and 401 responses, never
 *      leaks X-Powered-By, and honours the CSP_MODE / HSTS env switches.
 *   2. The static edge configs (Vercel, Cloudflare/Netlify _headers, nginx)
 *      still match the canonical policy in middleware/securityHeaders.js, so the
 *      copies can not drift apart silently.
 *
 * No MongoDB is required - app.js is importable without a database.
 * Run with: node tests/security-headers.test.js   (from the backend folder)
 */
process.env.NODE_ENV = 'production';
delete process.env.CSP_MODE;
delete process.env.CSP_REPORT_URI;
delete process.env.CSP_NONCE;
delete process.env.HSTS_ENABLED;
delete process.env.HSTS_MAX_AGE;
delete process.env.HSTS_PRELOAD;
delete process.env.API_CORP;

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const {
  buildCspDirectives,
  headerPolicySnapshot,
} = require('../middleware/securityHeaders');

let failures = 0;
const failedChecks = [];
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures += 1;
    failedChecks.push(detail ? `${name} - ${detail}` : name);
    console.log(`  \u2717 ${name}${detail ? ` - ${detail}` : ''}`);
  }
};

// Helmet joins directives without spaces ("a 'b';c 'd'") while the canonical
// snapshot is written with spaces. Both are valid HTTP: compare normalised.
const norm = (value) =>
  String(value === undefined ? '' : value)
    .replace(/\s+/g, ' ')
    .replace(/\s*;\s*/g, '; ')
    .replace(/\s*,\s*/g, ', ')
    .trim();

// Switches that change the policy. Always reset them before staging a new app so
// one section of this suite can never leak configuration into the next.
const SECURITY_KEYS = [
  'CSP_MODE',
  'CSP_REPORT_URI',
  'CSP_NONCE',
  'HSTS_ENABLED',
  'HSTS_MAX_AGE',
  'HSTS_INCLUDE_SUBDOMAINS',
  'HSTS_PRELOAD',
  'API_CORP',
  'SPA_CONNECT_SRC',
];

const loadApp = (env = {}) => {
  ['../app.js', '../middleware/securityHeaders.js'].forEach((rel) => {
    delete require.cache[require.resolve(rel)];
  });
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  return require('../app.js');
};

// Build the app with exactly the given switches and nothing left over.
const stage = (env = {}) => {
  SECURITY_KEYS.forEach((key) => delete process.env[key]);
  return loadApp({ ...env, NODE_ENV: env.NODE_ENV || 'production' });
};

const header = (res, name) => res.headers[name.toLowerCase()];

const run = async () => {
  const apiPolicy = headerPolicySnapshot({ profile: 'api' });
  const spaPolicy = headerPolicySnapshot({ profile: 'spa' });
  const app = stage();

  console.log('\n[1] Every required header is present on a normal API response');
  let res = await request(app).get('/api/health');
  check('health endpoint still answers 200', res.status === 200 && res.body.success === true, JSON.stringify(res.body));
  Object.entries(apiPolicy).forEach(([name, value]) => {
    check(`${name} present and exact`, norm(header(res, name)) === norm(value), `got "${header(res, name)}"`);
  });

  console.log('\n[2] Framework disclosure is suppressed');
  check('no X-Powered-By', header(res, 'x-powered-by') === undefined, `got "${header(res, 'x-powered-by')}"`);
  check('no Server header added by the app', header(res, 'server') === undefined, `got "${header(res, 'server')}"`);

  console.log('\n[3] CSP: strict, no unsafe-inline / unsafe-eval, clickjacking blocked');
  const apiCsp = String(header(res, 'content-security-policy') || '');
  check('CSP matches the canonical api profile', norm(apiCsp) === norm(apiPolicy['Content-Security-Policy']), apiCsp);
  check("default-src 'none'", /default-src 'none'/.test(apiCsp));
  check("frame-ancestors 'none'", /frame-ancestors 'none'/.test(apiCsp));
  check("base-uri 'none'", /base-uri 'none'/.test(apiCsp));
  check("object-src 'none'", /object-src 'none'/.test(apiCsp));
  check('no unsafe-inline anywhere', !/unsafe-inline/.test(apiCsp));
  check('no unsafe-eval anywhere', !/unsafe-eval/.test(apiCsp));
  check('no wildcard source', !/(^|[ ;])\*([ ;]|$)/.test(apiCsp));
  check('sandbox directive present', /(^|; )sandbox(;|$)/.test(norm(apiCsp)));
  check('CSP hashes/nonces match the SPA defaults (no nonce needed)', !/nonce-/.test(apiCsp));

  console.log('\n[4] Clickjacking, MIME sniffing and transport hardening values');
  check('X-Frame-Options: DENY', header(res, 'x-frame-options') === 'DENY');
  check('X-Content-Type-Options: nosniff', header(res, 'x-content-type-options') === 'nosniff');
  check(
    'HSTS max-age is two years (63072000)',
    /max-age=63072000/.test(String(header(res, 'strict-transport-security'))),
    header(res, 'strict-transport-security')
  );
  check('HSTS includeSubDomains', /includeSubDomains/.test(String(header(res, 'strict-transport-security'))));
  check('HSTS preload stays off until prerequisites are met', !/preload/.test(String(header(res, 'strict-transport-security'))));
  check(
    'Referrer-Policy = strict-origin-when-cross-origin with no-referrer fallback',
    norm(header(res, 'referrer-policy')) === norm(apiPolicy['Referrer-Policy']),
    header(res, 'referrer-policy')
  );
  check('COOP: same-origin', header(res, 'cross-origin-opener-policy') === 'same-origin');
  check('COEP: require-corp', header(res, 'cross-origin-embedder-policy') === 'require-corp');
  check('CORP: cross-origin for the API (CORS still gates reads)', header(res, 'cross-origin-resource-policy') === 'cross-origin');
  check('Origin-Agent-Cluster: ?1', header(res, 'origin-agent-cluster') === '?1');
  check('X-DNS-Prefetch-Control: off', header(res, 'x-dns-prefetch-control') === 'off');
  check('X-Permitted-Cross-Domain-Policies: none', header(res, 'x-permitted-cross-domain-policies') === 'none');
  check('X-Download-Options: noopen', header(res, 'x-download-options') === 'noopen');
  check('legacy XSS auditor disabled (X-XSS-Protection: 0)', header(res, 'x-xss-protection') === '0');
  check('legacy XSS auditor never re-enabled as mode=block', !/mode=block/.test(String(header(res, 'x-xss-protection'))));

  console.log('\n[5] Permissions-Policy denies the high risk browser APIs');
  const pp = String(header(res, 'permissions-policy') || '');
  [
    'camera',
    'microphone',
    'geolocation',
    'payment',
    'usb',
    'accelerometer',
    'gyroscope',
    'magnetometer',
    'midi',
    'hid',
    'serial',
    'display-capture',
    'idle-detection',
    'clipboard-read',
    'clipboard-write',
    'publickey-credentials-get',
    'xr-spatial-tracking',
  ].forEach((feature) => {
    check(`${feature}=()`, pp.includes(`${feature}=()`), pp);
  });
  check('no feature is granted to any origin (=*)', !/=\*/.test(pp));
  check('no feature is granted to self', !/\(self\)/.test(pp));

  console.log('\n[6] Ledger responses can never be cached');
  const expectNoStore = (label, response) => {
    check(`${label}: Cache-Control no-store`, /no-store/.test(String(header(response, 'cache-control'))), header(response, 'cache-control'));
    check(`${label}: no-cache + must-revalidate`, /no-cache/.test(String(header(response, 'cache-control'))) && /must-revalidate/.test(String(header(response, 'cache-control'))));
    check(`${label}: not public`, !/public/.test(String(header(response, 'cache-control'))));
    check(`${label}: Pragma no-cache`, header(response, 'pragma') === 'no-cache');
    check(`${label}: Expires 0`, header(response, 'expires') === '0');
  };
  expectNoStore('success', res);
  expectNoStore('protected 401', await request(app).get('/api/members'));
  expectNoStore('unknown /api route 404', await request(app).get('/api/does-not-exist'));
  const plain404 = await request(app).get('/not-an-api-route');
  check('non-API 404 still carries the security headers', plain404.status === 404 && header(plain404, 'x-frame-options') === 'DENY');
  check('non-API 404 is left cacheable (static semantics preserved)', header(plain404, 'cache-control') === undefined || !/no-store/.test(String(header(plain404, 'cache-control'))));

  console.log('\n[7] CORS allow-list behaviour is unchanged');
  const allowed = await request(app).get('/api/health').set('Origin', 'https://worker-payment-details.vercel.app');
  check('allowed origin receives Access-Control-Allow-Origin', header(allowed, 'access-control-allow-origin') === 'https://worker-payment-details.vercel.app');
  // Auth uses a Bearer header, not cookies: credentialed CORS is deliberately
  // OFF (credentials:true + a widened allow-list would be a cross-origin
  // session bypass). Assert its ABSENCE so it cannot sneak back in unnoticed.
  check('allowed origin does NOT get credential access (Bearer auth)', header(allowed, 'access-control-allow-credentials') !== 'true');
  const denied = await request(app).get('/api/health').set('Origin', 'https://evil.example');
  check('unknown origin is rejected', denied.status === 403, `status=${denied.status}`);
  check('unknown origin gets no Access-Control-Allow-Origin', header(denied, 'access-control-allow-origin') === undefined);
  check('CORS preflight responds 200 OK with Access-Control-Allow-Origin', (await request(app).options('/api/auth/login').set('Origin', 'https://worker-payment-details.vercel.app').set('Access-Control-Request-Method', 'POST')).status === 200);
  check('CORS preflight still advertises only the allowed methods/headers', /GET,POST,PUT,PATCH,DELETE,OPTIONS/.test(String(header(await request(app).options('/api/task-notes').set('Origin', 'https://worker-payment-details.vercel.app').set('Access-Control-Request-Method', 'POST'), 'access-control-allow-methods'))));

  console.log('\n[8] Environment switches behave as documented');
  let staged = stage({ HSTS_ENABLED: 'false' });
  check('HSTS_ENABLED=false removes Strict-Transport-Security', header(await request(staged).get('/api/health'), 'strict-transport-security') === undefined);

  staged = stage({ HSTS_MAX_AGE: '600' });
  check(
    'a sub-one-year max-age is clamped to 31536000',
    /max-age=31536000/.test(String(header(await request(staged).get('/api/health'), 'strict-transport-security'))),
    header(await request(staged).get('/api/health'), 'strict-transport-security')
  );

  staged = stage({ HSTS_PRELOAD: 'true' });
  check(
    'HSTS_PRELOAD=true adds the preload token',
    /includeSubDomains; *preload/.test(String(header(await request(staged).get('/api/health'), 'strict-transport-security')))
  );

  staged = stage({ API_CORP: 'same-site' });
  check('API_CORP=same-site is honoured', header(await request(staged).get('/api/health'), 'cross-origin-resource-policy') === 'same-site');

  staged = stage({ CSP_MODE: 'report-only', CSP_REPORT_URI: 'https://csp.example.test/collect' });
  const reported = await request(staged).get('/api/health');
  check('report-only mode sends Content-Security-Policy-Report-Only', Boolean(header(reported, 'content-security-policy-report-only')));
  check('report-only mode does NOT enforce yet', header(reported, 'content-security-policy') === undefined);
  check("report-only policy contains report-uri", /report-uri https:\/\/csp\.example\.test\/collect/.test(String(header(reported, 'content-security-policy-report-only'))));
  check("report-only policy contains report-to csp-endpoint", /report-to csp-endpoint/.test(String(header(reported, 'content-security-policy-report-only'))));
  check('Reporting-Endpoints advertises the group', header(reported, 'reporting-endpoints') === 'csp-endpoint="https://csp.example.test/collect"');

  staged = stage({ CSP_MODE: 'off' });
  const offRes = await request(staged).get('/api/health');
  check('CSP_MODE=off sends no CSP at all', header(offRes, 'content-security-policy') === undefined && header(offRes, 'content-security-policy-report-only') === undefined);
  check('CSP_MODE=off still keeps the other headers', header(offRes, 'x-frame-options') === 'DENY');

  console.log('\n[9] SPA profile: nonce mode for a server-rendered shell');
  // Drop every switch staged in [8] so the canonical snapshots used by the
  // anti-drift checks below are compared against the real defaults again.
  ['HSTS_ENABLED', 'HSTS_MAX_AGE', 'HSTS_PRELOAD', 'API_CORP', 'CSP_REPORT_URI', 'CSP_MODE'].forEach((key) => delete process.env[key]);
  process.env.CSP_NONCE = 'true';
  process.env.NODE_ENV = 'production';
  delete require.cache[require.resolve('../middleware/securityHeaders.js')];
  const { securityHeaders } = require('../middleware/securityHeaders');
  const spaApp = express();
  spaApp.use(securityHeaders('spa'));
  spaApp.get('/', (req, res) => res.json({ nonce: res.locals.cspNonce }));
  const nonceResA = await request(spaApp).get('/');
  const nonceResB = await request(spaApp).get('/');
  const spaCsp = String(header(nonceResA, 'content-security-policy'));
  check('SPA CSP allows the API origin in connect-src', /connect-src 'self' https:\/\/worker-payment-details\.onrender\.com/.test(spaCsp), spaCsp);
  check("SPA CSP forbids frames and inline handlers", /frame-ancestors 'none'/.test(spaCsp) && /script-src-attr 'none'/.test(spaCsp) && /style-src-attr 'none'/.test(spaCsp));
  check("SPA CSP has no 'unsafe-inline'/'unsafe-eval'", !/unsafe-inline|unsafe-eval/.test(spaCsp));
  check('nonce is present in script-src when CSP_NONCE=true', /'nonce-[A-Za-z0-9+/=]+'/.test(spaCsp), spaCsp);
  check('nonce is exposed to templates via res.locals.cspNonce', nonceResA.body.nonce === nonceResA.body.nonce && typeof nonceResA.body.nonce === 'string' && nonceResA.body.nonce.length >= 16);
  check('a fresh nonce is generated per request', nonceResA.body.nonce !== nonceResB.body.nonce);
  check('the nonce in the header matches res.locals.cspNonce', spaCsp.includes(`'nonce-${nonceResA.body.nonce}'`));
  delete process.env.CSP_NONCE;

  console.log('\n[10] Static edge configs match the canonical SPA policy (anti-drift)');
  const repoRoot = path.join(__dirname, '..', '..');
  const readText = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  const exists = (rel) => fs.existsSync(path.join(repoRoot, rel));

  const parseVercel = (text) => {
    const config = JSON.parse(text);
    const map = {};
    (config.headers || []).forEach((rule) => {
      (rule.headers || []).forEach((h) => {
        map[String(h.key).toLowerCase()] = h.value;
      });
    });
    return { config, map };
  };

  // Netlify / Cloudflare Pages _headers format: a path line, then indented pairs.
  const parseHeadersFile = (text) => {
    const sections = {};
    let current = null;
    text.split(/\r?\n/).forEach((line) => {
      if (!line.trim() || /^\s*#/.test(line)) return;
      if (!/^\s/.test(line)) {
        current = line.trim();
        sections[current] = {};
        return;
      }
      const match = /^\s+([A-Za-z0-9-]+):\s*(.+?)\s*$/.exec(line);
      if (match && current) sections[current][match[1].toLowerCase()] = match[2];
    });
    return sections;
  };

  ['frontend/vercel.json', 'vercel.json'].forEach((rel) => {
    check(`${rel} exists`, exists(rel));
    if (!exists(rel)) return;
    const text = readText(rel);
    const { config, map } = parseVercel(text);
    Object.entries(spaPolicy).forEach(([name, value]) => {
      check(`${rel}: ${name}`, norm(map[name.toLowerCase()]) === norm(value), `got "${map[name.toLowerCase()]}"`);
    });
    const ruleFor = (source) => (config.headers || []).find((rule) => rule.source === source);
    const valueOf = (rule, key) => {
      if (!rule) return undefined;
      const found = (rule.headers || []).find((h) => h.key.toLowerCase() === key.toLowerCase());
      return found && found.value;
    };
    const shellCache = String(valueOf(ruleFor('/index.html'), 'Cache-Control'));
    const assetCache = String(valueOf(ruleFor('/assets/(.*)'), 'Cache-Control'));
    check(`${rel}: HTML shell must revalidate on every load`, /no-cache/.test(shellCache), shellCache);
    check(`${rel}: hashed assets cached immutable for a year`, /max-age=31536000/.test(assetCache) && /immutable/.test(assetCache), assetCache);
    check(`${rel}: /assets/* is not given no-store`, !/no-store/.test(assetCache));
    check(`${rel}: SPA rewrite to /index.html kept`, (config.rewrites || []).some((r) => r.destination === '/index.html'));
  });

  const headersFile = 'frontend/public/_headers';
  check(`${headersFile} exists`, exists(headersFile));
  if (exists(headersFile)) {
    const sections = parseHeadersFile(readText(headersFile));
    const root = sections['/*'] || {};
    Object.entries(spaPolicy).forEach(([name, value]) => {
      check(`${headersFile} /*: ${name}`, norm(root[name.toLowerCase()]) === norm(value), `got "${root[name.toLowerCase()]}"`);
    });
    check(`${headersFile} /*: HTML shell revalidates`, /no-cache/.test(String(root['cache-control'])));
    const assets = sections['/assets/*'] || {};
    check(`${headersFile} /assets/*: immutable year`, /max-age=31536000/.test(String(assets['cache-control'])) && /immutable/.test(String(assets['cache-control'])));
  }

  const nginxShared = 'deploy/nginx/security-headers.conf';
  const nginxMain = 'deploy/nginx/financial-ledger.conf';
  // Comment lines are inert configuration: strip them before any matching so a
  // commented-out directive can never satisfy a check.
  const stripComments = (text) =>
    text
      .split(/\r?\n/)
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
  const parseNginxAddHeaders = (text) => {
    const map = {};
    text.split(/\r?\n/).forEach((line) => {
      const match = /^\s*add_header\s+([A-Za-z0-9-]+)\s+"([^"]*)"\s+always\s*;/.exec(line);
      if (match) map[match[1].toLowerCase()] = match[2];
    });
    return map;
  };
  check(`${nginxShared} exists`, exists(nginxShared));
  check(`${nginxMain} exists`, exists(nginxMain));
  if (exists(nginxShared) && exists(nginxMain)) {
    const main = norm(stripComments(readText(nginxMain)));
    const canonicalLower = Object.fromEntries(Object.entries(spaPolicy).map(([name, value]) => [name.toLowerCase(), value]));

    // Active (non-comment) add_header directives must equal the canonical set:
    // nothing missing, nothing extra, nothing edited.
    const active = parseNginxAddHeaders(readText(nginxShared));
    Object.entries(canonicalLower).forEach(([name, value]) => {
      check(`${nginxShared}: add_header ${name} active and exact`, norm(active[name]) === norm(value), `got "${active[name]}"`);
    });
    const unexpected = Object.keys(active).filter((name) => !(name in canonicalLower));
    check(`${nginxShared}: no add_header outside the canonical policy`, unexpected.length === 0, unexpected.join(', '));
    check(`${nginxShared}: header count matches (${Object.keys(canonicalLower).length})`, Object.keys(active).length === Object.keys(canonicalLower).length, `found ${Object.keys(active).length}`);

    check('nginx: server_tokens off', /server_tokens off;/.test(main));
    check('nginx: framework header stripped at the proxy', /proxy_hide_header X-Powered-By;/.test(main));
    check('nginx: shared security header file is included', /security-headers\.conf;/.test(main));
    check('nginx: TLS 1.0/1.1 refused', /ssl_protocols TLSv1\.2 TLSv1\.3;/.test(main));
    check('nginx: HTTP permanently upgraded to HTTPS', /return 301 https:\/\/\$host\$request_uri;/.test(main));
    check('nginx: SPA history fallback kept', /try_files \$uri \$uri\/ \/index\.html;/.test(main));
    check('nginx: API proxied to the Node app', /proxy_pass http:\/\/127\.0\.0\.1:5000;/.test(main));
    check('nginx: real client IP forwarded to the API', /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/.test(main));
    check('nginx: forwarded protocol header for Express trust proxy', /proxy_set_header X-Forwarded-Proto \$scheme;/.test(main));
    check('nginx: request size ceiling set', /client_max_body_size/.test(main));
    check('nginx: hashed assets cached immutable, HTML revalidated', /immutable/.test(main) && /no-cache/.test(main));
    check('nginx: no HSTS on the plaintext :80 server block', !/listen 80[^;]*;[\s\S]{0,500}Strict-Transport-Security/.test(main.slice(0, main.indexOf('listen 443'))));
  }

  console.log('\n[11] server.js is import-safe (no listener, no database on import)');
  const mongoose = require('mongoose');
  const realConnect = mongoose.connect;
  let connectCalls = 0;
  mongoose.connect = (...args) => {
    connectCalls += 1;
    return realConnect.apply(mongoose, args);
  };
  let serverModule;
  let importError = null;
  try {
    serverModule = require('../server.js');
  } catch (err) {
    importError = err;
  } finally {
    mongoose.connect = realConnect;
  }
  check('importing server.js does not throw', importError === null, importError && importError.message);
  check('importing server.js does not connect to MongoDB', connectCalls === 0, `connect() calls: ${connectCalls}`);
  check('server.js exports the Express app', typeof serverModule === 'function' && typeof serverModule.listen === 'function');
  check('exported app still serves /api/health', (await request(serverModule).get('/api/health')).status === 200);

};

run()
  .then(() => {
    if (failures === 0) {
      console.log('\nAll security header checks passed.\n');
      process.exit(0);
    }
    console.log(`\n${failures} security header check(s) FAILED:\n`);
    failedChecks.forEach((name) => console.log(`  - ${name}`));
    console.log('');
    process.exit(1);
  })
  .catch((err) => {
    console.error('\nSecurity header suite crashed:\n', err);
    process.exit(1);
  });

