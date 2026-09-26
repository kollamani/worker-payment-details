const rateLimit = require('express-rate-limit');

/*
 * Rate limiting - brute-force protection.
 *
 *   apiLimiter   : general ceiling for every /api request (DoS / scraping).
 *   authLimiter  : strict ceiling for login attempts (credential stuffing).
 *   signupLimiter: strict ceiling for signup attempts (account-spam / race
 *                  abuse of the one-admin limit).
 *
 * All values are env-tunable so tests / load-tests can raise them.
 * `app.set('trust proxy', ...)` in app.js makes req.ip the real client IP
 * behind the Render/nginx proxy, so limits cannot be bypassed by X-Forwarded-For
 * spoofing (never set trust proxy to `true` blindly).
 */

const intFromEnv = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const commonOptions = {
  standardHeaders: 'draft-7', // RateLimit-* draft headers (preferred over legacy X-RateLimit-*)
  legacyHeaders: false,
  // Preflight OPTIONS must never count toward limits. A 429 without CORS
  // headers looks exactly like "No Access-Control-Allow-Origin" in the browser.
  skip: (req) => req.method === 'OPTIONS',
};

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: intFromEnv('API_RATE_LIMIT_MAX', 300),
  message: { success: false, message: 'Too many requests, please slow down.' },
  ...commonOptions,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: intFromEnv('AUTH_RATE_LIMIT_MAX', 10),
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
  ...commonOptions,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: intFromEnv('SIGNUP_RATE_LIMIT_MAX', 5),
  message: { success: false, message: 'Too many signup attempts. Try again later.' },
  ...commonOptions,
});

module.exports = { apiLimiter, authLimiter, signupLimiter };
