#!/usr/bin/env node
// Compares the schema (tables, columns, types, nulls, defaults, indexes, foreign keys) of two LOCAL databases.
//   node scripts/db-schema-diff.js <dbA> <dbB> [--ignore table1,table2]
// Connection from DB_HOST / DB_PORT / DB_USER / DB_PASSWORD (backend/.env). Read-only. Refuses remote hosts.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const { snapshot, diff } = require('../src/db/schemaSnapshot');

(async () => {
  const [nameA, nameB] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const ignoreIndex = process.argv.indexOf('--ignore');
  const ignoreTables = ignoreIndex > -1 ? process.argv[ignoreIndex + 1].split(',') : [];
  if (!nameA || !nameB) throw new Error('Usage: db-schema-diff.js <dbA> <dbB> [--ignore t1,t2]');
  const host = process.env.DB_HOST || 'localhost';
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Refusing to compare databases on a non-local host');
  const connection = await mysql.createConnection({
    host, port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || ''
  });
  try {
    const [a, b] = [await snapshot(connection, nameA), await snapshot(connection, nameB)];
    const differences = diff(a, b, { nameA, nameB, ignoreTables });
    const count = o => Object.values(o).reduce((n, t) => n + Object.keys(t.columns).length, 0);
    console.log(`${nameA}: ${Object.keys(a).length} tables, ${count(a)} columns`);
    console.log(`${nameB}: ${Object.keys(b).length} tables, ${count(b)} columns`);
    if (!differences.length) console.log('Schemas are equivalent.');
    else { console.log(`${differences.length} difference(s):`); differences.forEach(d => console.log('  - ' + d)); process.exitCode = 1; }
  } finally { await connection.end(); }
})().catch(e => { console.error(e.message); process.exit(2); });
