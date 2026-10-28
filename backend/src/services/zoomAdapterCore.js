const crypto = require('node:crypto');

class ZoomError extends Error {
  constructor(code, statusCode = 409, params = {}, { retryable = false, retryAt = null } = {}) {
    super(`Zoom: ${code}`);
    Object.assign(this, { code, statusCode, params, retryable, retryAt });
  }
}

const fail = (code, status = 409, params = {}, options = {}) => {
  throw new ZoomError(code, status, params, options);
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

module.exports = { ZoomError, fail, hash };
