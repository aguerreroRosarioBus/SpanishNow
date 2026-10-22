const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { User } = require('../models');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { createToken, consumeToken, MIN_PASSWORD_LENGTH } = require('../services/passwordTokens');
const { sendMail } = require('../services/mailService');
const { passwordReset } = require('../services/emailTemplates');
const { signToken, serializeAuthUser } = require('../services/authUser');

// Register
router.post('/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    // Public sign-up only creates students: teacher accounts come from the seed or the database.
    body('role').optional().equals('student').withMessage('Role must be student')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Datos inválidos', errors: errors.array(), code: 'validation_failed', params: { fields: errors.array().map(e => e.path) } });
      }

      const { name, email, password } = req.body;

      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered', code: 'email_already_registered', params: {} });
      }

      const user = await User.create({ name, email, password, role: 'student' });

      res.status(201).json({ user: serializeAuthUser(user), token: signToken(user) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Login
router.post('/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Datos inválidos', errors: errors.array(), code: 'validation_failed', params: { fields: errors.array().map(e => e.path) } });
      }

      const { email, password } = req.body;

      const user = await User.findOne({ where: { email } });
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials', code: 'invalid_credentials', params: {} });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials', code: 'invalid_credentials', params: {} });
      }

      // Only after the password matched, so the answer does not reveal which emails have an account.
      if (user.suspendedAt) {
        return res.status(403).json({ error: 'This account is suspended', code: 'account_suspended', params: {} });
      }

      res.json({ user: serializeAuthUser(user), token: signToken(user) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Current user, to refresh permissions and flags without signing in again
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: serializeAuthUser(req.user, { impersonatedBy: req.impersonatedBy }) });
});

// Change password
router.post('/change-password',
  authMiddleware,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Datos inválidos', errors: errors.array(), code: 'validation_failed', params: { fields: errors.array().map(e => e.path) } });
      }

      const { currentPassword, newPassword } = req.body;

      // Get user from database
      const user = await User.findByPk(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found', code: 'not_found', params: {} });
      }

      // Verify current password
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ error: 'Current password is incorrect', code: 'current_password_invalid', params: {} });
      }

      // Check if new password is different from current
      const isSameAsOld = await user.comparePassword(newPassword);
      if (isSameAsOld) {
        return res.status(400).json({ error: 'New password must be different from current password', code: 'password_unchanged', params: {} });
      }

      // Update password (will be hashed by User model hook)
      user.password = newPassword;
      await user.save();

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Forgot password: always 200, so the answer never reveals whether the email has an account.
// The token and the email are handled after answering, so response time does not reveal it either.
router.post('/forgot-password',
  [body('email').isEmail().withMessage('Valid email is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg, code: 'validation_failed', params: { fields: errors.array().map(e => e.path) } });
    }
    const email = String(req.body.email).trim().toLowerCase();
    res.json({ message: 'If that email has an account, we sent a link to reset the password' });
    try {
      const user = await User.findOne({ where: { email } });
      if (!user) return;
      const token = await createToken(user, 'reset');
      await sendMail({ to: user.email, ...passwordReset({ name: user.name, token, locale: user.locale }) });
    } catch (error) {
      console.error('Forgot password failed:', error.message);
    }
  }
);

// Reset (or first-time choice of) password with the token from the email. Signs the user in.
router.post('/reset-password',
  [
    body('token').isString().notEmpty().withMessage('Token is required'),
    body('password').isLength({ min: MIN_PASSWORD_LENGTH }).withMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, code: 'validation_failed', params: { fields: errors.array().map(e => e.path) } });
      }
      const user = await consumeToken(req.body.token, req.body.password);
      if (!user) return res.status(400).json({ error: 'This link is invalid or has expired', code: 'password_link_invalid', params: {} });
      if (user.suspendedAt) return res.status(403).json({ error: 'This account is suspended', code: 'account_suspended', params: {} });
      res.json({ user: serializeAuthUser(user), token: signToken(user) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
