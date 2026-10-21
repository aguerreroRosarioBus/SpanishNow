// Student accounts created on behalf of a buyer or an imported student.
const crypto = require('crypto');
const { UniqueConstraintError } = require('sequelize');
const { User } = require('../models');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = value => String(value ?? '').trim().toLowerCase();
const isValidEmail = email => email.length <= 100 && EMAIL_PATTERN.test(email); // users.email is STRING(100)

/** Name for an account created without one: "jane.doe+x@example.com" -> "jane.doe+x". */
const nameFromEmail = email => email.split('@')[0].slice(0, 100) || email.slice(0, 100);
const cleanName = (name, email) => {
  const cleaned = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return cleaned || nameFromEmail(email);
};

/**
 * Finds the user with that email or creates a student with an unusable random password (the person chooses
 * theirs through an invite token). Returns { user, created }.
 */
async function findOrCreateStudent({ email, name }, { transaction } = {}) {
  const normalized = normalizeEmail(email);
  const existing = await User.findOne({ where: { email: normalized }, transaction });
  if (existing) return { user: existing, created: false };
  try {
    const user = await User.create({
      name: cleanName(name, normalized),
      email: normalized,
      password: crypto.randomBytes(32).toString('hex'),
      role: 'student'
    }, { transaction });
    return { user, created: true };
  } catch (error) {
    // Lost a race with a concurrent request creating the same email.
    if (error instanceof UniqueConstraintError) {
      // A locking read sees the row the other transaction just committed (a plain read uses the older snapshot).
      const user = await User.findOne({ where: { email: normalized }, transaction, lock: transaction ? transaction.LOCK.SHARE : undefined });
      if (user) return { user, created: false };
    }
    throw error;
  }
}

module.exports = { normalizeEmail, isValidEmail, cleanName, findOrCreateStudent };
