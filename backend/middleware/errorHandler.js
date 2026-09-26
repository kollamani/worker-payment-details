const notFound = (req, res, next) => {
  res.status(404).json({ success: false, message: 'Route not found' });
};

/*
 * Central error handler - hardened against information disclosure.
 *
 *  - Internal (5xx) messages are NEVER sent to clients: raw Mongoose/driver
 *    errors can leak collection names, connection details or query shapes.
 *  - CastError no longer echoes the attacker-supplied value back
 *    (`Invalid ID format: <input>` was a reflection/probing oracle).
 *  - Stack traces are only attached outside production, for local debugging.
 */
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Server Error';

  // Mongoose bad ObjectId - generic message, do not echo the input value.
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0];
    message = `Duplicate value for field: ${field}`;
  }

  // Mongoose validation error (messages are authored by our own schemas -
  // safe to return).
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  // Never expose internal error details on 5xx responses.
  if (statusCode >= 500) {
    message = 'Server Error';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'production' ? {} : { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };
