const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { hasPermission } = require('../config/permissions');
const { secret } = require('../services/authUser');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, secret());
    const user = await User.findByPk(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    // A suspended account stops working at once, even with a token that has not expired.
    if (user.suspendedAt) {
      return res.status(401).json({ error: 'Account suspended' });
    }

    req.user = user;
    if (decoded.impersonatedBy) req.impersonatedBy = decoded.impersonatedBy;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Identifies the user when a valid token comes along, and lets anonymous requests (or stale tokens) through.
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, secret());
      const user = await User.findByPk(decoded.id);
      if (user && !user.suspendedAt) {
        req.user = user;
        if (decoded.impersonatedBy) req.impersonatedBy = decoded.impersonatedBy;
      }
    }
  } catch (error) {
    // invalid or expired token: treated as anonymous
  }
  next();
};

const isTeacher = (req, res, next) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Access denied. Teachers only.' });
  }
  next();
};

const isStudent = (req, res, next) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Access denied. Students only.' });
  }
  next();
};

// After authMiddleware. Allows users with any of the permissions; "sign in as" sessions never reach admin endpoints.
const requirePermission = (...keys) => (req, res, next) => {
  if (req.impersonatedBy || !keys.some(key => hasPermission(req.user, key))) {
    return res.status(403).json({ error: 'Access denied. Missing permission.' });
  }
  next();
};

module.exports = { authMiddleware, optionalAuth, isTeacher, isStudent, requirePermission };
