// =====================================================================
// ERROR HANDLING
// =====================================================================

// Wrap async route handlers so thrown errors reach the error handler
const asyncHandler = fn => (req, res, next) => fn(req, res, next).catch(next);

// Last middleware: turns any error into a JSON response
function errorHandler(err, _req, res, _next) {
  console.error(err);
  res.status(500).json({ error: err.message });
}

module.exports = { asyncHandler, errorHandler };
