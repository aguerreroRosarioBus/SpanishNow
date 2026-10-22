// Last-resort error handler (registered last in app.js). Errors with a statusCode answer with it; the rest are 500.
// Errors that carry a stable lowercase `code` (e.g. CreditError) also return it with its `params`, so clients can
// translate them (CONTRACT-02, I18N-04): { error, code, params }. Node/system codes (ECONNREFUSED...) are never exposed.
const STABLE_CODE = /^[a-z][a-z0-9_]*$/;

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err.stack);
  const body = { error: err.message || 'Internal Server Error' };
  if (err.statusCode && typeof err.code === 'string' && STABLE_CODE.test(err.code)) {
    body.code = err.code;
    body.params = err.params || {};
  }
  res.status(err.statusCode || 500).json(body);
}

module.exports = { errorHandler };
