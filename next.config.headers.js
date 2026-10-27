/*
 * Next.js header configuration - REFERENCE ONLY.
 *
 * This repository does NOT run Next.js: the frontend is a Vite + React SPA
 * (frontend/vite.config.js) deployed as static files. Keep this file out of the
 * build; it exists so that a future Next.js shell (or a Next.js based proxy in
 * front of the API) can adopt the identical policy without re-deriving it.
 *
 * Canonical values come from backend/middleware/securityHeaders.js:
 *   cd backend && npm run verify:headers -- --print --profile spa
 * The values below are asserted against that snapshot for vercel.json,
 * frontend/public/_headers and the nginx snippets by
 * backend/tests/security-headers.test.js.
 *
 * Usage: rename to next.config.js (or merge the async headers() into yours).
 */

/** @type {import('next').NextConfig} */
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'none'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self'",
      "script-src-elem 'self'",
      "script-src-attr 'none'",
      "style-src 'self'",
      "style-src-elem 'self'",
      "style-src-attr 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' https://worker-payment-details.onrender.com",
      "media-src 'none'",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "frame-src 'none'",
      "child-src 'none'",
      'upgrade-insecure-requests',
    ].join('; '),
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer, strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: [
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
    ].join(', '),
  },
  { key: 'Origin-Agent-Cluster', value: '?1' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'X-Download-Options', value: 'noopen' },
  { key: 'X-XSS-Protection', value: '0' },
];

const nextConfig = {
  poweredByHeader: false, // do not advertise Next.js (X-Powered-By)
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/assets/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }] },
      { source: '/:path*', headers: securityHeaders },
    ];
  },
};

module.exports = nextConfig;
