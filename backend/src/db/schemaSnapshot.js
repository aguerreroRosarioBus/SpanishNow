// Normalised picture of a database schema (information_schema) and a diff between two of them.
// Used to prove that "empty database + migrations" and "restored dump + adopt + migrations" end up
// with the same schema (tests/migrationRunner.test.js, scripts/db-schema-diff.js).
// Row data and AUTO_INCREMENT counters are deliberately ignored.

async function snapshot(connection, database) {
  const q = async (sql) => (await connection.query(sql, [database]))[0];
  const tables = {};
  const table = name => (tables[name.toLowerCase()] ||= { columns: {}, indexes: {}, foreignKeys: {} });

  for (const t of await q('SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation, TABLE_COMMENT AS comment FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = \'BASE TABLE\'')) {
    Object.assign(table(t.name), { engine: t.engine, collation: t.collation, comment: t.comment });
  }
  for (const c of await q('SELECT TABLE_NAME AS t, COLUMN_NAME AS name, ORDINAL_POSITION AS pos, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS def, EXTRA AS extra, CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation, COLUMN_COMMENT AS comment FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION')) {
    table(c.t).columns[c.name] = { pos: Number(c.pos), type: c.type, nullable: c.nullable, default: c.def, extra: c.extra, charset: c.charset, collation: c.collation, comment: c.comment };
  }
  for (const s of await q('SELECT TABLE_NAME AS t, INDEX_NAME AS name, NON_UNIQUE AS nonUnique, SEQ_IN_INDEX AS seq, COLUMN_NAME AS col, SUB_PART AS sub, INDEX_TYPE AS type FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX')) {
    const index = (table(s.t).indexes[s.name] ||= { unique: Number(s.nonUnique) === 0, type: s.type, columns: [] });
    index.columns.push(s.sub ? `${s.col}(${s.sub})` : s.col);
  }
  for (const f of await q('SELECT k.TABLE_NAME AS t, k.CONSTRAINT_NAME AS name, k.COLUMN_NAME AS col, k.REFERENCED_TABLE_NAME AS refTable, k.REFERENCED_COLUMN_NAME AS refCol, r.UPDATE_RULE AS onUpdate, r.DELETE_RULE AS onDelete FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION')) {
    const fk = (table(f.t).foreignKeys[f.name] ||= { columns: [], refTable: f.refTable.toLowerCase(), refColumns: [], onUpdate: f.onUpdate, onDelete: f.onDelete });
    fk.columns.push(f.col);
    fk.refColumns.push(f.refCol);
  }
  return tables;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Flat list of human-readable differences; empty when the schemas are equivalent. */
function diff(a, b, { nameA = 'A', nameB = 'B', ignoreTables = [] } = {}) {
  const ignored = new Set(ignoreTables.map(t => t.toLowerCase()));
  const out = [];
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(n => !ignored.has(n)).sort();
  for (const name of names) {
    if (!a[name]) { out.push(`table ${name}: only in ${nameB}`); continue; }
    if (!b[name]) { out.push(`table ${name}: only in ${nameA}`); continue; }
    for (const prop of ['engine', 'collation']) {
      if (a[name][prop] !== b[name][prop]) out.push(`table ${name}.${prop}: ${nameA}=${a[name][prop]} ${nameB}=${b[name][prop]}`);
    }
    for (const kind of ['columns', 'indexes', 'foreignKeys']) {
      const keys = [...new Set([...Object.keys(a[name][kind]), ...Object.keys(b[name][kind])])].sort();
      for (const key of keys) {
        const x = a[name][kind][key]; const y = b[name][kind][key];
        if (!x) out.push(`${kind.slice(0, -1)} ${name}.${key}: only in ${nameB}`);
        else if (!y) out.push(`${kind.slice(0, -1)} ${name}.${key}: only in ${nameA}`);
        else if (!same(x, y)) out.push(`${kind.slice(0, -1)} ${name}.${key}: ${nameA}=${JSON.stringify(x)} ${nameB}=${JSON.stringify(y)}`);
      }
    }
  }
  return out;
}

module.exports = { snapshot, diff };
