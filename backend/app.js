/*
 * Express application for the Financial Ledger API.
 *
 * Deliberately separated from server.js (which owns the process: dotenv,
 * MongoDB connection and app.listen) so that tests and audit scripts can
 * exercise the REAL middleware stack without opening a port or touching the
 * database.
 *
 * Middleware order is part of the security contract:
 *   security headers -> CORS -> body limits -> no-store for /api -> routes
 *   -> 404 -> error handler
 * Header middleware must run first so that error/404 responses carry the same
 * hardening as successful ones.
 */
const express = require('express');
const cors = require('cors');

const { securityHeaders, apiNoStore } = require('./middleware/securityHeaders');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter, authLimiter, signupLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const transactionRoutes = require('./routes/transactions');
const taskNoteRoutes = require('./routes/task-notes');

const app = express();

// Do not advertise the framework on every response (X-Powered-By: Express).
app.disable('x-powered-by');

// Exactly one reverse proxy (Render / Vercel / nginx) sits in front of the app.
// Without this, req.secure and req.ip are wrong, which breaks the HSTS decision
// and any future IP based rate limiting.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

// 1) Security headers first: every response below (including 404/500) inherits them.
app.use(securityHeaders());

// 2) CORS - explicit allow-list, never a wildcard.
// NOTE: `credentials` is deliberately OFF - auth uses a Bearer header, not
// cookies, so credentialed requests are unnecessary. If you ever move to
// cookie-based sessions, re-enable `credentials: true` here AND keep the
// allow-list exact (a wildcard with credentials would be a full bypass).
//
// Render fix: set CLIENT_URL (or FRONTEND_URL) on Render to your Vercel URL:
//   CLIENT_URL=https://worker-payment-details.vercel.app
// Comma-separated values are supported:
//   CLIENT_URL=https://worker-payment-details.vercel.app,https://preview-xyz.vercel.app
const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '');

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://worker-payment-details.vercel.app',
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  process.env.ADDITIONAL_ORIGINS,
]
  .flatMap((value) => String(value || '').split(','))
  .map(normalizeOrigin)
  .filter(Boolean);
const uniqueOrigins = [...new Set(allowedOrigins)];

// Vite auto-increments its port when 5173 is already taken (5174, 5175, ...),
// which would silently break login with a strict single-port allow-list.
// In NON-production, any loopback origin (localhost / 127.0.0.1 / [::1],
// http/https only) is accepted - safe because it can only come from the same
// machine. Production keeps the exact allow-list above.
const isLoopbackOrigin = (value) => {
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'];
    return local.includes(url.hostname) && (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
};
const devAllowsLoopback = () => process.env.NODE_ENV !== 'production';

const corsOptions = {
  origin(origin, callback) {
    const normalized = normalizeOrigin(origin);
    // Same-origin and server-to-server callers (curl, Postman, Render health
    // probes) send no Origin header. Everything else must be allow-listed.
    if (!origin || uniqueOrigins.includes(normalized)) {
      return callback(null, true);
    }
    if (devAllowsLoopback() && isLoopbackOrigin(origin)) {
      return callback(null, true);
    }
    const err = new Error('Origin not allowed by CORS');
    err.statusCode = 403;
    return callback(err);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  credentials: false,
  // Some legacy browsers / proxies choke on 204 for preflight.
  optionsSuccessStatus: 200,
  maxAge: 600,
};

app.use(cors(corsOptions));

// Explicit preflight handler so every OPTIONS request answers 200 OK with the
// CORS headers above, even for paths with no route handler.
app.options('*', cors(corsOptions));

// 3) Body parsers with an explicit ceiling so the limit can never drift silently.
const bodyLimit = process.env.JSON_BODY_LIMIT || '100kb';
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

// 4) Rate limiting: general /api ceiling first, then the strict limits for
// the credential endpoints (brute-force / signup-spam protection).
// NOTE: OPTIONS preflights are skipped inside middleware/rateLimit.js (`skip`).
// A 429 without CORS headers surfaces in the browser as a misleading
// "No Access-Control-Allow-Origin" error, so preflights must never be counted.
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', signupLimiter);

// 5) Ledger data is sensitive: forbid caching by browsers, proxies and CDNs.
app.use('/api', apiNoStore);

// 6) Health check (used by the host platform and by the header audit script)
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Financial Ledger API is running' });
});

// 7) Routes
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/transactions', transactionRoutes);
// taskNoteRoutes uses relative paths: GET/POST "/" => /api/task-notes.
app.use('/api/task-notes', taskNoteRoutes);

// 8) Error handling (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
