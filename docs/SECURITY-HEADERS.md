# HTTP Security Headers - hardened policy

Owner: Principal Application Security / DevSecOps
Scope: `financial-ledger-app` (React SPA on Vercel + Express/MongoDB API on Render)

## 1. Stack and where headers must live

```
Browser --HTTPS--> https://worker-payment-details.vercel.app   (Vite/React SPA, static)
        |             -> CSP, HSTS, COOP/COEP/CORP, Referrer-Policy,
        |                Permissions-Policy, X-Frame-Options, cache rules
        '--HTTPS--> https://worker-payment-details.onrender.com (Express API, Cloudflare in front)
                      -> same security headers + Cache-Control: no-store
                         (served by backend/middleware/securityHeaders.js)
```

The two origins are **independent**: a header set on one origin does nothing for the
other. Both must be configured, and both are audited by
`backend/scripts/verify-security-headers.js`. A third profile is provided for
self-hosting behind nginx (`deploy/nginx/*.conf`), which serves the SPA and proxies
the API from one host.

### Measured baseline (captured before this change)

| Origin | Observed |
| --- | --- |
| SPA (Vercel) | `Server: Vercel`, platform HSTS only. **No** CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy. |
| API (Render) | `x-powered-by: Express`, `Server: cloudflare`, `x-render-origin-server: Render`. **No** security headers at all, no `Cache-Control`. |

Both origins intentionally **FAIL** the audit today. Re-run the audit after deploying.

## 2. Threat -> header matrix

| Attack class | Control | Value used |
| --- | --- | --- |
| Clickjacking / UI redress | CSP `frame-ancestors 'none'` + `X-Frame-Options` | `DENY` (legacy fallback) |
| XSS (inline script, event handlers, `eval`) | CSP `script-src 'self'`, `script-src-attr 'none'`, `style-src-attr 'none'`, `default-src 'none'` | no `unsafe-inline`, no `unsafe-eval` |
| `<base>` hijack, plugin injection, form hijack | `base-uri 'none'`, `object-src 'none'`, `form-action 'self'/'none'` | strict |
| MIME sniffing (drive-by downloads) | `X-Content-Type-Options` | `nosniff` |
| MitM / SSL stripping | `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (preload deliberately off - see §6) |
| Referrer leakage (IDs/tokens in URLs) | `Referrer-Policy` | `no-referrer, strict-origin-when-cross-origin` (fallback list) |
| Cross-origin opener abuse, Spectre-class leakage | COOP / COEP / CORP | `same-origin` / `require-corp` / `same-origin` (SPA), `cross-origin` (API) |
| Cross-origin data reads, `/api` mis-embedding | CORP + existing CORS allow-list | API `cross-origin` (CORS still gates reads), SPA `same-origin` |
| Camera / mic / geolocation / payment / USB / sensors | `Permissions-Policy` | 29 features, all `=()` - nothing granted |
| Sensitive response caching (browser, proxy, CDN) | `Cache-Control` + `Pragma` + `Expires` | `no-store, no-cache, must-revalidate, private` + `no-cache` + `0` |
| Framework fingerprinting | remove `X-Powered-By`, `server_tokens off`, `proxy_hide_header` | see §8 |
| DNS prefetch / legacy cross-domain readers | `X-DNS-Prefetch-Control: off`, `X-Permitted-Cross-Domain-Policies: none` | strict |
| Legacy XSS auditor flaws | `X-XSS-Protection: 0` | auditor disabled, never `mode=block` |

## 3. The canonical policy (single source of truth)

`backend/middleware/securityHeaders.js` builds two profiles. Every other config file
must equal them, and `backend/tests/security-headers.test.js` **fails if they drift**.

### API profile - `securityHeaders()`, mounted first in `backend/app.js`

```
Content-Security-Policy: default-src 'none'; base-uri 'none'; object-src 'none';
  frame-ancestors 'none'; form-action 'none'; script-src 'none'; style-src 'none';
  img-src 'none'; font-src 'none'; connect-src 'none'; media-src 'none';
  worker-src 'none'; manifest-src 'none'; frame-src 'none'; child-src 'none'; sandbox
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer, strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: cross-origin
Permissions-Policy: <29 features, all ()>
Origin-Agent-Cluster: ?1
X-DNS-Prefetch-Control: off
X-Permitted-Cross-Domain-Policies: none
X-Download-Options: noopen
X-XSS-Protection: 0
Cache-Control: no-store, no-cache, must-revalidate, private
Pragma: no-cache
Expires: 0
(absent: X-Powered-By, Server)
```

`sandbox` is a no-op for a JSON body and neutralises the document if the API ever
renders HTML by accident. Remove it if you deliberately add an HTML UI (Swagger,
docs) to the API origin.

`Cross-Origin-Resource-Policy: cross-origin` on the API is intentional: the SPA is a
different site (`vercel.app` vs `onrender.com`), reads are still gated by the CORS
allow-list, and `cross-origin` keeps COEP `require-corp` on the SPA from ever
becoming a blocker for ledger requests. Tighten to `same-site`/`same-origin` with
`API_CORP=...` if the API is ever served from the same site as the SPA.

### SPA profile - `securityHeaders('spa')` and the static host configs

Identical except:

```
Content-Security-Policy: default-src 'none'; base-uri 'none'; object-src 'none';
  frame-ancestors 'none'; form-action 'self'; script-src 'self'; script-src-elem 'self';
  script-src-attr 'none'; style-src 'self'; style-src-elem 'self'; style-src-attr 'none';
  img-src 'self' data: blob:; font-src 'self';
  connect-src 'self' https://worker-payment-details.onrender.com;
  media-src 'none'; worker-src 'self' blob:; manifest-src 'self';
  frame-src 'none'; child-src 'none'; upgrade-insecure-requests
Cross-Origin-Resource-Policy: same-origin
(no Cache-Control - the static host owns caching, see §7)
```

`connect-src` lists the API origin. After changing `VITE_API_URL`, update it here
(or set `SPA_CONNECT_SRC` for the Express-rendered variant) - otherwise the browser
will silently block every ledger request.

### Files that carry the SPA policy

| File | Consumed by |
| --- | --- |
| `frontend/vercel.json` | Vercel project with Root Directory = `frontend` (the live deployment) |
| `vercel.json` (repo root) | Vercel project with Root Directory = repo root (kept in sync as insurance) |
| `frontend/public/_headers` | Netlify / Cloudflare Pages (copied to `dist/_headers` by the build) |
| `deploy/nginx/security-headers.conf` | nginx, included by `deploy/nginx/financial-ledger.conf` |
| `frontend/next.config.headers.js` | **reference only** - this repo does not run Next.js |

Print the canonical values any time:

```bash
cd backend
npm run verify:headers -- --print                # api profile
npm run verify:headers -- --print --profile spa  # spa profile
```

## 4. Production configuration snippets

### 4.1 Node.js / Express (Helmet 8) - what this repo runs

Installed as a normal dependency (`backend/package.json` -> `"helmet": "^8.3.0"`).

```js
// backend/app.js - already wired, do not reorder these three lines
app.disable('x-powered-by');                                   // framework disclosure
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1)); // req.secure / req.ip behind Render/Cloudflare/nginx
app.use(securityHeaders());                                    // MUST run before routes + error handler
app.use('/api', apiNoStore);                                   // MUST run before the route handlers
```

The middleware in `backend/middleware/securityHeaders.js` is the Helmet configuration
this application uses, expressed explicitly:

```js
const helmet = require('helmet');

app.use(
  helmet({
    // CSP is a separate middleware so CSP_MODE (enforce/report-only/off) and
    // optional nonces can switch it without rebuilding the whole bundle.
    contentSecurityPolicy: { useDefaults: false, directives: { /* canonical map */ } },
    strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: false },
    referrerPolicy: { policy: ['no-referrer', 'strict-origin-when-cross-origin'] },
    crossOriginEmbedderPolicy: { policy: 'require-corp' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },   // API profile
    xFrameOptions: { action: 'deny' },
    xContentTypeOptions: true,                               // X-Content-Type-Options: nosniff
    xDnsPrefetchControl: { allow: false },
    xDownloadOptions: true,
    xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
    xPoweredBy: true,                                        // REMOVES X-Powered-By
    xXssProtection: true,                                    // emits `0` (legacy auditor off)
    originAgentCluster: true,
  })
);

// Helmet has no Permissions-Policy middleware - set it yourself.
// Sensitive JSON must never be cached - this must run before the routes.
```

Both of those are implemented in `middleware/securityHeaders.js`
(`permissionsPolicyMiddleware` and `apiNoStore`). Switch the CSP to Report-Only
without touching code: `CSP_MODE=report-only` (see §5).

### 4.2 Vercel (live frontend)

`frontend/vercel.json` defines three header rules:

| `source` | Adds |
| --- | --- |
| `/assets/(.*)` | `Cache-Control: public, max-age=31536000, immutable` (content-hashed bundle) |
| `/index.html` | `Cache-Control: no-cache, must-revalidate` (deploys show immediately) |
| `/(.*)` | the entire SPA security policy |

Notes:
- Vercel applies **all** matching rules, so `/(.*)` also covers assets and deep SPA
  routes (`/dashboard`, `/task-notes`, ...). Only one rule sets `Cache-Control` per
  path, so nothing conflicts.
- Vercel already injects `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  by default. Our explicit value without `preload` is intentional - see §6. Verify
  after deploy that only one HSTS header arrives: `curl -sI ... | grep -i strict`.
- `Server: Vercel` and `x-vercel-*` cannot be removed on Vercel (platform headers).
- Preview deployments receive the same policy - that is desirable.

### 4.3 Cloudflare Pages / Netlify

`frontend/public/_headers` (the Vite build copies it to `dist/_headers`):

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*
  Content-Security-Policy: ...
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  ...full policy...
  Cache-Control: no-cache, must-revalidate
```

Rule order matters: the hashed-asset rule comes **before** the catch-all so the first
matching rule wins for `Cache-Control`.

If the API is fronted by Cloudflare (it is today), adding the API headers at the edge
is good belt-and-braces - but the Express middleware remains the source of truth and
is what the audit checks first.

### 4.4 nginx (self-host, one origin for SPA + API)

Two files: `deploy/nginx/financial-ledger.conf` (server/TLS/proxy) and
`deploy/nginx/security-headers.conf` (the header set).

```nginx
server {
    listen 80;
    server_name worker-payment-details.example.com;
    return 301 https://$host$request_uri;      # plaintext block: no security headers
}

server {
    listen 443 ssl;
    http2 on;
    server_tokens off;                          # hides the nginx version
    client_max_body_size 1m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_stapling on;

    root /var/www/financial-ledger/dist;
    include /etc/nginx/snippets/financial-ledger-security-headers.conf;
    try_files $uri $uri/ /index.html;

    location /assets/ {
        include /etc/nginx/snippets/financial-ledger-security-headers.conf; # REQUIRED, see below
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location = /index.html {
        include /etc/nginx/snippets/financial-ledger-security-headers.conf;
        add_header Cache-Control "no-cache, must-revalidate" always;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header X-Powered-By;        # defence in depth
    }
}
```

**nginx gotcha (why the snippet file exists):** `add_header` directives are inherited
from an outer block *only* when the inner block declares none of its own. The moment a
location sets `Cache-Control`, every inherited security header silently vanishes for
that response. Including the same snippet in each such location restores them, and
nginx does not duplicate them (an inner `add_header` suppresses inheritance entirely).

Validate before reload: `nginx -t && systemctl reload nginx`.

### 4.5 Next.js (reference only)

`frontend/next.config.headers.js` maps the identical policy to
`async headers()` with `poweredByHeader: false`. This repo does **not** run Next.js -
use it only if you adopt Next.js for the shell or as an edge proxy. The values are
kept aligned with the canonical snapshot; the drift test does not currently cover this
file (it is not deployed).

## 5. Content-Security-Policy: nonces, hashes and the Report-Only rollout

### 5.1 Why this app needs neither a nonce nor a hash (verified, not assumed)

`script-src 'self'` and `style-src 'self'` are sufficient because the Vite production
build emits **no inline script and no inline style**:

```html
<script type="module" crossorigin src="/assets/index-CAygkvu3.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-DyJuFnj_.css">
```

Verify after every build (this is a committed tool, run it in CI):

```bash
cd backend && npm run verify:headers -- --hashes ../frontend/dist/index.html
# Inline <script> blocks : 0
# Inline <style> blocks  : 0
# No inline scripts or styles found. A nonce/hash is NOT required: ...
```

The app also contains zero `style={{...}}` attributes (Tailwind classes only), which
is what makes `style-src-attr 'none'` achievable.

### 5.2 When you DO need a nonce or a hash

| Situation | Use |
| --- | ---|
| Inline `<script>` added to `index.html` (tag manager, bootstrap data) | **hash**: `npm run verify:headers -- --hashes <file>` prints `'sha256-...'` tokens to paste into `script-src`. The hash breaks on every content change - prefer moving the code into a file. |
| HTML rendered per request by Express/SSR | **nonce**: set `CSP_NONCE=true`, mount `securityHeaders('spa')`, then write `<script nonce="<%= res.locals.cspNonce %>">`. Each request gets a fresh nonce (`res.locals.cspNonce`). |
| Third-party analytics/fonts added later | Prefer self-hosting the asset. Otherwise add the exact origin to `script-src`/`style-src`/`font-src` - never `'unsafe-inline'`, never `https:`. |

`'strict-dynamic'` is deliberately **not** used: it ignores `'self'` and would break
Vite's `<link rel="modulepreload">` hints, which cannot carry a nonce.

### 5.3 Safe rollout in Report-Only (do this first in production)

Report-Only sends the policy as `Content-Security-Policy-Report-Only`, so violations
are **logged but never blocked**. Nothing can break; you get real-world evidence.

**Phase 0 - instrument (no risk).**
```bash
# API side (Express): one env var, no deploy of new code
CSP_MODE=report-only CSP_REPORT_URI=https://<your-collector>/csp npm start
```
For the static SPA origin, temporarily publish the same policy under the
`Content-Security-Policy-Report-Only` key instead (Vercel: duplicate the `/(.*)` rule
with that key and remove the enforcing one), plus `Reporting-Endpoints`.

**Phase 1 - collect for 3-7 days.** Read reports (`violation`, `blocked-uri`, `sample`).
Expected sources of noise to fix or accept:
- browser extensions / injected scripts (`blocked-uri` = inline or extension origin)
- any inline handler or style you added by mistake
- preconnect/DNS-prefetch not covered by a directive (harmless, informational)

**Phase 2 - fix violations, re-run Report-Only** until the report is empty for real
user flows (login, ledger create, task notes, Excel export).

**Phase 3 - enforce.**
```bash
CSP_MODE=enforce npm start          # API
# SPA: swap the Report-Only header for Content-Security-Policy in the same rule
```
Keep `CSP_REPORT_URI` set in both modes: enforced policies still report violations,
which is how you catch regressions in production.

**Phase 4 - CI gate.**
```bash
cd backend && npm run test:security-headers   # policy + anti-drift (exit 1 on failure)
cd backend && npm run verify:headers -- --hashes ../frontend/dist/index.html
```

Rollback is a single env var / header key change (`CSP_MODE=report-only`), so the
blast radius of Phase 3 is a redeploy away from zero.

### 5.4 Reporting endpoints

When `CSP_REPORT_URI` is set, the middleware adds to every response:
- `report-uri <url>; report-to csp-endpoint` inside the CSP
- `Reporting-Endpoints: csp-endpoint="<url>"` (the modern `Reporting-Api` header)

Free/self-hosted collectors: `securityheaders.com` report URI, Mozilla Observatory,
`report-uri.com`, or a Cloudflare Worker writing to your SIEM. Reports are JSON
(`{"csp-report": {...}}`) - ship them next to application logs.

## 6. HSTS and preload prerequisites

Configured value: **`max-age=63072000; includeSubDomains`** (2 years), sent only when
`NODE_ENV=production` (or `HSTS_ENABLED=true`), and never from a plaintext dev server.

| Directive | Here | Why |
| --- | --- | --- |
| `max-age` | `63072000` (2 years) | Requirement: at least 1-2 years. Values below `31536000` are **clamped up** with a warning, because the preload list refuses anything shorter. |
| `includeSubDomains` | on | Applies the policy to every subdomain of the host it is served from. On a single host (`worker-payment-details.onrender.com`) this is effectively a no-op today, but it is correct and future-proof. |
| `preload` | **off** | Deliberate - see below. |

### Why `preload` is off (and when to turn it on)

Submit to [hstspreload.org](https://hstspreload.org) only when **all** of these hold:

1. You own the **apex domain** and every subdomain over which you can enforce HTTPS.
2. Every subdomain serves HTTPS with a valid certificate and never allows HTTP to be
   bypassed (no browser "proceed anyway" escape hatch for those hosts).
3. The response already carries `max-age >= 31536000` **and** `includeSubDomains`
   over HTTPS on the apex.
4. You accept that removal takes months and browsers will refuse plaintext on every
   included host the moment the entry lands.
5. The domain is **not** on the Public Suffix List.

**This app currently violates (1) and (5):** both hosts live on shared, PSL-listed
registrable domains (`*.vercel.app`, `*.onrender.com`). hstspreload.org rejects
submissions for PSL domains, so adding `preload` here would buy nothing and imply a
commitment you cannot keep. Note that Vercel already advertises `; preload` by
default on `*.vercel.app` - harmless (the token is ignored unless the origin is
listed), but it is why our own config omits it.

When you move to `ledger.example.com` (an apex you control):

```bash
HSTS_PRELOAD=true HSTS_MAX_AGE=63072000 npm start    # API origin
# static hosts: add "; preload" to Strict-Transport-Security in the same configs
```

Prerequisites checklist before submitting both origins:
- [ ] `curl -sI https://ledger.example.com | grep -i strict` shows `max-age>=31536000; includeSubDomains`
- [ ] `https://ledger.example.com` and every subdomain answer 200 over HTTPS
- [ ] `http://` on all of them 301s to `https://`
- [ ] the apex is *not* on the Public Suffix List
- [ ] your ops runbook includes keeping TLS valid for the full `max-age`

### HSTS testing notes

- Browsers only honour HSTS received **over HTTPS**; sending it over HTTP is ignored
  (and the plaintext nginx block deliberately omits it).
- HSTS is per-host (plus subdomains), so the API and the SPA each need their own.
- Clearing HSTS locally: `chrome://net-internals/#hsts` -> Delete domain policy.

## 7. Cache-Control and information-leak prevention

### Sensitive responses (API)

Every `/api/*` response (success, 401, 404, 500) carries:

```
Cache-Control: no-store, no-cache, must-revalidate, private
Pragma: no-cache
Expires: 0
```

- `no-store` - browsers/shared caches must not persist ledger data at all
- `no-cache, must-revalidate` - even if stored, revalidation is mandatory
- `private` - never a shared/CDN cache
- `Pragma`/`Expires` - HTTP/1.0 and legacy-proxy fallbacks

Implemented by `apiNoStore`, mounted **before** the routes so 200s are covered (the
classic bug is mounting it after the routes, where only errors get it).

### Static assets (SPA)

| Path | Value | Rationale |
| --- | --- | --- |
| `/assets/*` | `public, max-age=31536000, immutable` | filenames are content-hashed by Vite; safe to cache for a year |
| `/index.html` | `no-cache, must-revalidate` | a deploy must be visible on the next load |
| SPA routes (`/dashboard` ...) | revalidated | rewritten to the shell by the host |

### Disclosure headers

| Header | Status | How |
| --- | --- | --- |
| `X-Powered-By` | **removed** | `app.disable('x-powered-by')` + Helmet `xPoweredBy: true` (strips it if a dependency re-adds it) + nginx `proxy_hide_header X-Powered-By` |
| `Server` | platform-owned | Express never sends one. nginx: `server_tokens off` hides the version. Vercel (`Server: Vercel`) and Cloudflare (`Server: cloudflare`) cannot be removed without a proxy you control - **accepted residual risk** (version is not exposed). |
| `x-render-origin-server`, `rndr-id`, `cf-ray`, `x-vercel-*` | platform-owned | request IDs; useful for support, not a meaningful attack surface. Reported as WARN by the audit, never FAIL. |
| `X-XSS-Protection` | set to `0` | the legacy auditor has known bypasses and is removed in modern browsers; `1; mode=block` is never emitted |
| Error stacks | not exposed | `errorHandler` only returns `stack` when `NODE_ENV !== 'production'` |

## 8. Verification checklist (cURL + scanners)

### 8.1 One-shot project audit (recommended first step)

```bash
cd backend

# local instance of the real middleware stack (no database needed) - must be 0
npm run verify:headers
# expected: "22/22 checks passed, 0 failed."  (exit 0)

# deployed API - fails until the backend is redeployed with these changes
npm run verify:headers -- --url https://worker-payment-details.onrender.com

# deployed SPA - fails until vercel.json ships
npm run verify:headers -- --url https://worker-payment-details.vercel.app --profile spa

# machine readable for CI
npm run verify:headers -- --json | jq '.failed'
```

Exit codes: `0` = compliant, `1` = a required header missing/wrong, `2` = could not
probe the target.

### 8.2 Raw cURL spot checks

```bash
# Full header dump of each origin
curl -sI https://worker-payment-details.vercel.app/ 
curl -sI https://worker-payment-details.onrender.com/api/health

# Only the security-relevant ones
curl -sI <origin> | grep -Ei \
 'content-security-policy|strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|cross-origin-(opener|embedder|resource)-policy|permissions-policy|cache-control'

# Disclosure must be ABSENT
curl -sI https://worker-payment-details.onrender.com/api/health | grep -i x-powered-by   # expect: (nothing)
curl -sI <origin> | grep -iE '^server:'    # expect only a platform value (Vercel/cloudflare/nginx)

# HSTS max-age is >= 1 year
curl -sI <origin> | grep -i strict-transport-security   # max-age=63072000

# Clickjacking header + CSP frame-ancestors agree
curl -sI <origin> | grep -iE 'x-frame-options|frame-ancestors'

# Sensitive responses are never cacheable
curl -sI https://worker-payment-details.onrender.com/api/health | grep -i cache-control
# expect: no-store, no-cache, must-revalidate, private

# HTTP -> HTTPS (nginx/host level)
curl -sI http://<host>/ | head -1         # expect: HTTP/1.1 301 Moved Permanently

# CORS: allowed origin echoes, unknown origin is rejected with no ACAO
curl -sI -H 'Origin: https://worker-payment-details.vercel.app' .../api/health | grep -i access-control
curl -sI -H 'Origin: https://evil.example' .../api/health | head -1   # expect: HTTP/1.1 403
```

### 8.3 Browser checks (DevTools)

- [ ] **Network -> response headers** on a deep route (`/task-notes`): all headers present.
- [ ] **Console**: no `Refused to ... by the server's Content-Security-Policy` while
      logging in, creating a ledger entry, opening the Create Task modal, exporting Excel.
- [ ] **Clickjacking proof** (must be blocked):
      `document.body.innerHTML = '<iframe src="https://worker-payment-details.vercel.app"></iframe>'`
      from another origin's console -> refused by `frame-ancestors 'none'`.
- [ ] **Permissions**: `navigator.permissions.query({name:'geolocation'})` -> denied;
      `navigator.mediaDevices` -> `undefined`/blocked (camera/mic denied).
- [ ] **Cache**: reload with DevTools "Disable cache" off -> API responses show
      `(no-store)` / not from disk cache.
- [ ] **Excel export still works** (blob download is not CSP-governed - see §10).

### 8.4 External scanners (run after deploy)

| Tool | What it proves | Target |
| --- | --- | --- |
| [securityheaders.com](https://securityheaders.com) | overall grade (aim A/A+) | both origins |
| [Mozilla Observatory](https://observatory.mozilla.org) | score + CSP fingerprinting advice | both origins |
| [Google CSP Evaluator](https://csp-evaluator.withgoogle.com) | CSP bypass resistance (hash/nonce/allowlist weaknesses) | paste the SPA CSP |
| [SSL Labs](https://www.ssllabs.com/ssltest/) | TLS config, protocol/cipher coverage | both origins |
| [hstspreload.org](https://hstspreload.org) | status / eligibility of `max-age` | only on an owned apex |
| `nuclei -tags csp,misconfig,hsts` | automated misconfiguration regression | in CI |
| OWASP ZAP baseline scan | passive header/cookie/CSP scan of a spidered site | staging |

### 8.5 CI gate (add to the pipeline)

```bash
cd backend && npm run test:security-headers     # policy + anti-drift across all config files
cd frontend && npm run build
cd backend && npm run verify:headers -- --hashes ../frontend/dist/index.html   # inline script/style count must stay 0
cd backend && npm run verify:headers            # local header set must be compliant
```

The anti-drift test also asserts that `frontend/vercel.json`, the repo-root
`vercel.json`, `frontend/public/_headers` and `deploy/nginx/security-headers.conf`
all still carry the canonical policy - so a hand edit to *any* copy fails the build.

**Proven by mutation testing:** injecting `'unsafe-eval'` into `script-src` failed 4
checks (one per config copy); commenting out nginx `X-Frame-Options` failed 2 checks;
disabling `nosniff` failed 2 checks. Each mutation was restored byte-identically
(SHA-256 verified) and the suite returned to exit 0.

## 9. Findings from this assessment

Severity reflects impact on this application's data (financial/admin).

### P0 - act immediately (secret hygiene)

| # | Finding | Remediation |
| --- | --- | --- |
| 1 | `backend/.env` **and** `frontend/.env` are tracked in git (there was no root `.gitignore`). `backend/.env` contains a live MongoDB Atlas username/password and the JWT signing secret. The repo remote is `github.com/kollamani/worker-payment-details`. Anything ever pushed here should be treated as exposed. | 1) **Rotate the Atlas database user password now** (Atlas -> Database Access) and **rotate `JWT_SECRET`** (all sessions become invalid - acceptable). 2) `git rm --cached backend/.env frontend/.env` then commit (a root `.gitignore` now exists and covers them). 3) Rewrite git history (`git filter-repo`/BFG) if the repo is or ever becomes public, and revoke/rotate again afterwards. |
| 2 | `.env.example` shipped with the real Atlas credentials as the "template". | **Fixed in this change** - it now contains placeholders only. Anything that was in it is still burned (see #1). |

### P1 - fixed by this change (requires deploy)

| # | Finding | Status |
| --- | --- | --- |
| 3 | Neither origin sent CSP, `X-Frame-Options`, nosniff, Referrer-Policy, Permissions-Policy, COOP/COEP/CORP. Clickjacking and XSS had no header-layer defence. | Configs added for API + SPA + nginx; verify after deploy (§8). |
| 4 | API leaked `x-powered-by: Express` (framework/version fingerprinting). | `app.disable('x-powered-by')` + Helmet strip + nginx `proxy_hide_header`. |
| 5 | API responses were cacheable (no `Cache-Control`) - ledger data could persist in shared/browser caches. | `apiNoStore` on `/api` (`no-store, no-cache, must-revalidate, private`). |
| 6 | No HSTS on the API origin; SPA relied on the platform default only. | `max-age=63072000; includeSubDomains` on both origins (preload deliberately off, §6). |
| 7 | `app.set('trust proxy')` was unset behind Render/Cloudflare - `req.ip`/`req.secure` were wrong, which would silently break any IP-based control. | `trust proxy` = 1 hop (env `TRUST_PROXY_HOPS`). |

### P2 - residual risk (recommend follow-up work)

| # | Finding | Recommendation |
| --- | --- | --- |
| 8 | JWT lives in `localStorage` (`ledger_token`) - any XSS becomes full account takeover. | The strict CSP above is now the primary control. Medium term: move to an `httpOnly; Secure; SameSite=Strict` cookie + CSRF protection, or short-lived access tokens with refresh rotation. |
| 9 | No rate limiting on `POST /api/auth/login` / `signup` -> credential brute force. | Add `express-rate-limit` (dependency, consistent with this codebase) with a strict limiter on auth routes + lockout/backoff; the nginx file contains a commented `limit_req` example. |
| 10 | `credentials: true` on CORS although auth is a Bearer header (no cookies). | Drop to `credentials: false` unless/until cookie auth lands - it removes a whole class of future CSRF risk. |
| 11 | `notFound` echoes `req.originalUrl` into JSON. Not XSS (JSON + `nosniff`), but it is reflected content. | Truncate/encode the value before echoing. |
| 12 | `xlsx@0.18.5` - the 0.18 line predates the prototype-pollution fix (CVE-2023-30533, fixed upstream in 0.19.3+) and other parsing fixes. | Upgrade SheetJS from the official CDN build (`cdn.sheetjs.com`); re-run `npm audit` and the Excel export smoke test. |
| 13 | `frontend/node_modules` and `frontend/dist` are tracked in git (I observed deleted `.vite/deps` entries in `git status`). | `git rm -r --cached frontend/node_modules frontend/dist` (root `.gitignore` already lists them). |

### Not audited in this pass

Password hashing cost, JWT expiry/verification edge cases, object-level authorization
on routes other than task notes, input validation/Mongo injection, dependency CVEs
beyond `xlsx`, and infrastructure IAM. Track separately.

## 10. Known tradeoffs and troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Ledger requests blocked with `blocked by Cross-Origin-Embedder-Policy` | The API answered without a usable CORS response | Check `Access-Control-Allow-Origin` first (COEP accepts CORS-enabled responses). `API_CORP=cross-origin` on the API is the default and is what makes this robust. Only if you add *non-CORS* third-party subresources should you consider `credentialless` (Chrome-only) instead of `require-corp`. |
| A component's `style={{...}}` or a library's inline `style="..."` attribute is ignored | `style-src-attr 'none'` is active (verified: this codebase currently has **zero** style attributes) | Prefer Tailwind classes. If it is genuinely unavoidable, relax **only** `style-src-attr` to `'unsafe-inline'` (style attributes cannot execute script) and record the exception in this file - never add `unsafe-inline` to `script-src`. |
| Excel export appears broken after the SPA CSP ships | Blob download suspected | Anchor downloads to `blob:` URLs are not CSP fetch directives; `img-src`/`worker-src` already allow `blob:`. Re-run the export in DevTools with the Console open - if a CSP violation names a directive, add that exact source, not a wildcard. |
| Two `Strict-Transport-Security` headers on the SPA | Vercel injects its own in addition to `vercel.json` | `curl -sI ... \| grep -i strict`. Both are `max-age=63072000; includeSubDomains` (platform one adds `; preload`), so behaviour is identical. If you want exactly one, remove ours from `vercel.json` and document the platform as the owner. |
| CSP works on the live site but not in `npm run dev` | Vite's dev server injects an inline React-refresh preamble and uses `ws:` HMR | Intentional: the strict policy targets production assets. To exercise it locally, use `npm run build && npm run preview` (or audit the API profile with `npm run verify:headers`). |
| Vercel preview cannot reach the API | `connect-src` lists only the production API origin | Test previews against a locally served SPA (`npm run dev`, no CSP) or add the preview API origin to the `/(.*)` rule in `frontend/vercel.json`. |
| Report-Only floods with reports | Browser extensions / devtools injection | Filter by `blocked-uri`/`document-uri` and ignore extension-origin noise; never "fix" it by weakening `script-src`. |
| `nginx: add_header` headers missing on `/assets/*` | The inner `add_header Cache-Control` dropped inherited headers | Include `security-headers.conf` inside that location (already done in this repo's config). |
| Audit says `WARN ... server` | Platform header, not removable from app config | Accepted residual risk (§7). |

**Ordering rule in `index.css`:** the reduced-motion `animation: none !important`
block must stay *after* the utility rules so it wins specificity - unrelated to
headers, but it is the other place where ordering is a correctness property.

## 11. Environment reference, commands and file inventory

### Environment variables (defaults are the hardened values)

| Variable | Default | Effect |
| --- | --- | --- |
| `CSP_MODE` | `enforce` | `enforce` \| `report-only` \| `off` |
| `CSP_REPORT_URI` | unset | adds `report-uri`/`report-to` + `Reporting-Endpoints` |
| `CSP_NONCE` | `false` | per-request nonce for `securityHeaders('spa')` (HTML-rendering only) |
| `HSTS_ENABLED` | `NODE_ENV === 'production'` | emit HSTS at all |
| `HSTS_MAX_AGE` | `63072000` | clamped up to `31536000` minimum |
| `HSTS_INCLUDE_SUBDOMAINS` | `true` | `includeSubDomains` token |
| `HSTS_PRELOAD` | `false` | `preload` token (read §6 first) |
| `API_CORP` | `cross-origin` | `cross-origin` \| `same-site` \| `same-origin` |
| `API_CACHE_CONTROL` | `no-store, no-cache, must-revalidate, private` | `/api` cache policy |
| `SPA_CONNECT_SRC` | production API origin | extra origins for the SPA `connect-src` |
| `TRUST_PROXY_HOPS` | `1` | reverse proxy hops trusted by Express |
| `JSON_BODY_LIMIT` | `100kb` | request body ceiling |

All are documented inline in `backend/.env.example`.

### Commands

```bash
# backend
npm start                                   # server.js (dotenv -> app -> Mongo -> listen)
npm run test:security-headers               # 100+ header + anti-drift checks (no Mongo)
npm run verify:headers                      # live audit of the local app (exit 0 = compliant)
npm run verify:headers -- --print           # canonical values for static configs
npm run verify:headers -- --hashes ../frontend/dist/index.html
npm run verify:headers -- --url <origin> [--profile api|spa] [--json]

# frontend
npm run build                               # copies public/_headers into dist/
```

### Files changed by this work

| File | Purpose |
| --- | --- |
| `backend/middleware/securityHeaders.js` | **canonical policy** (Helmet 8 + Permissions-Policy, cache, nonce/reporting) |
| `backend/app.js` | app construction (headers first, CORS, body limits, `no-store`, routes) - importable without Mongo |
| `backend/server.js` | process entry point only (dotenv, Mongo, listener) |
| `backend/tests/security-headers.test.js` | policy assertions + anti-drift across all static configs |
| `backend/scripts/verify-security-headers.js` | auditor: `--url`, `--print`, `--hashes`, `--json` |
| `backend/package.json` | `helmet@^8.3.0`, `test:security-headers`, `verify:headers` scripts |
| `backend/.env.example` | placeholders + security knob documentation |
| `frontend/vercel.json`, `vercel.json` | SPA headers + caching for Vercel |
| `frontend/public/_headers` | SPA headers for Netlify / Cloudflare Pages |
| `frontend/next.config.headers.js` | Next.js reference mapping (not deployed) |
| `deploy/nginx/financial-ledger.conf` | hardened TLS + SPA + API reverse proxy |
| `deploy/nginx/security-headers.conf` | shared header snippet (include in every header-setting location) |
| `.gitignore` | stops `.env`, `dist`, `node_modules` from being tracked going forward |
| `docs/SECURITY-HEADERS.md` | this document |
