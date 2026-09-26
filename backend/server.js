/*
 * Process entry point: environment, database connection, HTTP listener.
 *
 * The Express app itself lives in app.js so that tests and audit scripts can
 * import the real middleware stack without starting a listener or connecting to
 * MongoDB (config/db.js calls process.exit(1) when the cluster is unreachable).
 */
require('dotenv').config();

// Security gate: refuse to boot with a missing/weak/placeholder JWT_SECRET
// (a weak secret lets anyone forge admin tokens). Runs only for the real
// entry point, so tests importing app.js/server.js are unaffected.
const { assertSecureEnv } = require('./config/env');

const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  assertSecureEnv();

  // Connect to MongoDB
  connectDB();

  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    console.log('Task Notes API mounted at /api/task-notes (GET, POST, PUT, DELETE)');
    console.log('Security headers: see backend/middleware/securityHeaders.js (audit with `npm run verify:headers`)');
  });
}

module.exports = app;
