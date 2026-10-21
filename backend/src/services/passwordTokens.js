// One-time tokens for "forgot password" (reset, 1 hour) and "choose your password" (invite, 14 days).
// The token travels in the email link; the database only keeps its sha256, so a leaked table cannot be used to log in.
const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { User, PasswordToken } = require('../models');

const TTL_MS = { reset: 60 * 60 * 1000, invite: 14 * 24 * 60 * 60 * 1000 };
const MIN_PASSWORD_LENGTH = 6; // same rule as register / change-password

const hashToken = token => crypto.createHash('sha256').update(String(token)).digest('hex');

/** Creates a token for the user and returns it in clear (the only moment it exists in clear). */
async function createToken(user, purpose, { transaction } = {}) {
  if (!TTL_MS[purpose]) throw new Error(`Unknown token purpose: ${purpose}`);
  const token = crypto.randomBytes(32).toString('base64url');
  await PasswordToken.create({
    userId: user.id,
    tokenHash: hashToken(token),
    purpose,
    expiresAt: new Date(Date.now() + TTL_MS[purpose])
  }, { transaction });
  return token;
}

/** True while the user still has an unused, unexpired invite: they never chose a password. */
async function hasPendingInvite(userId) {
  return Boolean(await PasswordToken.findOne({
    where: { userId, purpose: 'invite', usedAt: null, expiresAt: { [Op.gt]: new Date() } },
    attributes: ['id']
  }));
}

/**
 * Sets a new password with a reset or invite token. Returns the user, or null when the token is unknown, used or expired.
 * The token row is locked so the same token cannot be spent twice by concurrent requests.
 * Spending a token also invalidates the user's other pending tokens.
 */
async function consumeToken(token, password) {
  if (typeof token !== 'string' || !token) return null;
  return sequelize.transaction(async transaction => {
    const row = await PasswordToken.findOne({ where: { tokenHash: hashToken(token) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) return null;
    const user = await User.findByPk(row.userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) return null;
    user.password = password; // hashed by the model hook
    await user.save({ transaction });
    await PasswordToken.update({ usedAt: new Date() }, { where: { userId: user.id, usedAt: null }, transaction });
    return user;
  });
}

module.exports = { createToken, consumeToken, hasPendingInvite, hashToken, MIN_PASSWORD_LENGTH, TTL_MS };
