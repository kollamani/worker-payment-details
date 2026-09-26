/*
 * Fail-fast environment validation (security-critical settings).
 *
 * The app must never boot with a weak, missing or placeholder JWT secret:
 * anyone holding the secret can forge tokens for ANY admin. This module is
 * called from server.js ONLY when the process is the real entry point
 * (`require.main === module`), so tests that require app.js / server.js and
 * inject their own secret are not affected.
 *
 * Generate a strong secret:
 *   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
 */

// Secrets that have ever appeared in source, docs or .env.example files.
// A leaked/placeholder secret is as bad as no secret at all.
const FORBIDDEN_SECRETS = new Set([
  'change_this_to_a_long_random_secret_string',
  'fallback_secret_key_12345',
  'secret',
  'changeme',
]);

const MIN_SECRET_LENGTH = 32;

const assertSecureEnv = () => {
  const problems = [];

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    problems.push(
      'JWT_SECRET is not set. Generate one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  } else if (FORBIDDEN_SECRETS.has(secret)) {
    problems.push('JWT_SECRET is a known placeholder/leaked value. Generate a fresh random secret.');
  } else if (secret.length < MIN_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters (got ${secret.length}).`);
  }

  if (process.env.NODE_ENV === 'production' && !process.env.MONGODB_URI) {
    problems.push('MONGODB_URI is not set in production (would silently fall back to localhost).');
  }

  if (problems.length) {
    console.error('FATAL: insecure environment, refusing to start:');
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
};

module.exports = { assertSecureEnv, FORBIDDEN_SECRETS, MIN_SECRET_LENGTH };
