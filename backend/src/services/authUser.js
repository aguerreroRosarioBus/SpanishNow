// The user payload of every auth response and the session token, in one place.
const jwt = require('jsonwebtoken');
const { effectivePermissions } = require('../config/permissions');

const secret = () => process.env.JWT_SECRET || 'your-secret-key';

/** Token for the user. `impersonatedBy` (admin id) marks a "sign in as" session, which is short lived. */
const signToken = (user, { impersonatedBy, expiresIn = '7d' } = {}) => jwt.sign(
  { id: user.id, role: user.role, ...(impersonatedBy ? { impersonatedBy } : {}) },
  secret(),
  { expiresIn }
);

const serializeAuthUser = (user, { impersonatedBy } = {}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  permissions: effectivePermissions(user),
  isTestAccount: Boolean(user.isTestAccount),
  ...(impersonatedBy ? { impersonatedBy } : {})
});

module.exports = { signToken, serializeAuthUser, secret };
