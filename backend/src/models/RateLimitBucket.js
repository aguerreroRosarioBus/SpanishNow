const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/database');
// Fixed-window counters shared by every replica (chat limits, CHAT-07).
module.exports = sequelize.define('RateLimitBucket', {
  id: { type: D.BIGINT, primaryKey: true, autoIncrement: true },
  bucketKey: { type: D.STRING(191), allowNull: false },
  windowStart: { type: D.DATE, allowNull: false },
  hits: { type: D.INTEGER, allowNull: false, defaultValue: 0 }
}, { tableName: 'rate_limit_buckets', timestamps: true });
