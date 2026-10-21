// Throwaway databases for tests that need their own schema (migration runner, seeds).
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { Sequelize } = require('sequelize');

const connection = () => ({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
});

async function createScratchDb(name, { dump = false } = {}) {
  if (!/jest_test/.test(name)) throw new Error(`Refusing to (re)create "${name}": scratch databases must contain "jest_test"`);
  const admin = await mysql.createConnection(connection());
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally { await admin.end(); }
  if (dump) {
    const loader = await mysql.createConnection({ ...connection(), database: name, multipleStatements: true });
    try { await loader.query(fs.readFileSync(path.resolve(__dirname, '..', '..', 'Dump20260122.sql'), 'utf8')); } finally { await loader.end(); }
  }
  const { host, port, user, password } = connection();
  return new Sequelize(name, user, password, { host, port, dialect: 'mysql', logging: false });
}

async function dropScratchDb(name, sequelize) {
  if (sequelize) await sequelize.close();
  const admin = await mysql.createConnection(connection());
  try { await admin.query(`DROP DATABASE IF EXISTS \`${name}\``); } finally { await admin.end(); }
}

/** Raw mysql2 connection to a database (for schema snapshots). */
const openConnection = database => mysql.createConnection({ ...connection(), database });

module.exports = { createScratchDb, dropScratchDb, openConnection, connection };
