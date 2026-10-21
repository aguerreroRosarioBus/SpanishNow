// Migration runner (src/db/migrator.js, src/db/migrate.js): baseline, adopt and equivalence of both paths.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Sequelize } = require('sequelize');
const sequelize = require('../src/config/database');
const { createMigrator, status, adopt, MIGRATIONS_DIR } = require('../src/db/migrator');
const { snapshot, diff } = require('../src/db/schemaSnapshot');
const { TEST_DB_NAME } = require('./helpers/testEnv');
const { createScratchDb, dropScratchDb, openConnection } = require('./helpers/scratchDb');

const silent = { info() {}, warn() {}, error() {}, debug() {} };
const FILES = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.js')).sort();
const EMPTY_DB = 'spanishnow_jest_test_runner_empty';
const DUMP_DB = 'spanishnow_jest_test_runner_dump';

async function schemaOf(name) {
  const connection = await openConnection(name);
  try { return await snapshot(connection, name); } finally { await connection.end(); }
}

describe('migration runner', () => {
  let empty; let emptyMigrator;

  beforeAll(async () => {
    empty = await createScratchDb(EMPTY_DB);
    emptyMigrator = await createMigrator(empty, { logger: silent });
  });
  afterAll(async () => { await dropScratchDb(EMPTY_DB, empty); });

  test('the test database (dump + adopt + up) has every migration recorded and none pending', async () => {
    const migrator = await createMigrator(sequelize, { logger: silent });
    const { executed, pending } = await status(migrator);
    expect(pending).toEqual([]);
    expect([...executed].sort()).toEqual(FILES);
  });

  test('empty database + migrations applies everything in order, baseline first', async () => {
    const applied = await emptyMigrator.umzug.up();
    expect(applied.map(m => m.name)).toEqual(FILES);
    expect(FILES[0]).toBe('20260101000000-baseline-schema.js');
    expect((await status(emptyMigrator)).pending).toEqual([]);
    expect(await emptyMigrator.umzug.up()).toEqual([]); // nothing left
  });

  test('empty database + migrations and dump + adopt + migrations end in the same schema', async () => {
    const fromEmpty = await schemaOf(EMPTY_DB);
    const fromDump = await schemaOf(TEST_DB_NAME);
    expect(Object.keys(fromEmpty).length).toBeGreaterThan(10);
    expect(diff(fromEmpty, fromDump, { nameA: 'empty+migrate', nameB: 'dump+adopt+migrate' })).toEqual([]);
  });

  test('the schema diff reports real differences', async () => {
    const a = await schemaOf(EMPTY_DB);
    const b = JSON.parse(JSON.stringify(a));
    b.users.columns.email.type = 'varchar(50)';
    delete b.tooltips;
    expect(diff(a, b)).toEqual(expect.arrayContaining([expect.stringMatching(/column users\.email/), expect.stringMatching(/table tooltips: only in A/)]));
  });

  test('adopt on an up-to-date database changes nothing', async () => {
    const { report, warnings } = await adopt(emptyMigrator);
    expect(report.every(row => row.state === 'recorded')).toBe(true);
    expect(report).toHaveLength(FILES.length);
    expect(warnings).toEqual([]);
  });

  test('down reverts newest first and up applies them again to the same schema', async () => {
    const before = await schemaOf(EMPTY_DB);
    const reverted = await emptyMigrator.umzug.down({ to: '20261021000000-add-keyframe-tooltips.js' });
    expect(reverted.map(m => m.name)).toEqual([
      '20261105000000-create-live-classes.js',
      '20261104000300-add-unit-release.js', '20261104000200-create-lesson-comments.js', '20261104000100-add-order-affiliate-fields.js', '20261104000000-create-affiliates.js',
      '20261103000200-add-course-series.js', '20261103000100-add-order-sales-fields.js', '20261103000000-create-coupons.js',
      '20261102000300-create-certificates.js', '20261102000200-create-unit-quizzes.js', '20261102000100-create-materials.js', '20261102000000-add-video-urls.js',
      '20261101000300-add-enrollment-source.js', '20261101000200-create-password-tokens.js', '20261101000100-create-orders.js',
      '20261101000000-add-course-sales-fields.js', '20261023000000-add-keyframe-images.js', '20261022000000-drop-legacy-progress.js',
      '20261021000000-add-keyframe-tooltips.js'
    ]);
    expect((await status(emptyMigrator)).pending).toHaveLength(19);
    await emptyMigrator.umzug.up();
    expect(diff(before, await schemaOf(EMPTY_DB))).toEqual([]);
  });

  test('destructive migrations keep their confirmation variables', async () => {
    const baseline = require(path.join(MIGRATIONS_DIR, '20260101000000-baseline-schema.js'));
    const lessons = require(path.join(MIGRATIONS_DIR, '20260927000000-create-lesson-plans.js'));
    const qi = empty.getQueryInterface();
    delete process.env.CONFIRM_DROP_BASELINE;
    delete process.env.CONFIRM_LESSON_PLAN_DATA_LOSS;
    await expect(baseline.down(qi, Sequelize)).rejects.toThrow(/CONFIRM_DROP_BASELINE=yes/);
    await expect(lessons.down(qi, Sequelize)).rejects.toThrow(/CONFIRM_LESSON_PLAN_DATA_LOSS=yes/);
  });

  test('the baseline is a no-op on a database that already has the tables', async () => {
    const baseline = require(path.join(MIGRATIONS_DIR, '20260101000000-baseline-schema.js'));
    const before = await schemaOf(EMPTY_DB);
    await baseline.up(empty.getQueryInterface(), Sequelize);
    expect(diff(before, await schemaOf(EMPTY_DB))).toEqual([]);
  });

  describe('adopting a database restored from the dump', () => {
    let restored; let migrator;
    beforeAll(async () => {
      restored = await createScratchDb(DUMP_DB, { dump: true });
      migrator = await createMigrator(restored, { logger: silent });
    });
    afterAll(async () => { await dropScratchDb(DUMP_DB, restored); });

    test('detects what is present from the schema, dry run writes nothing', async () => {
      const { report, dryRun } = await adopt(migrator, { dryRun: true });
      const states = Object.fromEntries(report.map(r => [r.name, r.state]));
      expect(dryRun).toBe(true);
      expect(states).toMatchObject({
        '20260101000000-baseline-schema.js': 'adopted',
        '20260115131716-create-activity-config.js': 'recorded', // listed in the dump's own history table
        '20260115132247-add-activity-flags-to-enrollment.js': 'recorded',
        '20260122000000-add-audio-to-questions.js': 'pending',
        '20260127000000-create-tooltips.js': 'pending',
        '20260926000000-convert-activity-configs-to-story.js': 'pending', // still unit-scoped (unitId)
        '20260927000000-create-lesson-plans.js': 'pending',
        '20261021000000-add-keyframe-tooltips.js': 'pending',
        '20261022000000-drop-legacy-progress.js': 'pending',
        '20261023000000-add-keyframe-images.js': 'pending',
        '20261101000000-add-course-sales-fields.js': 'pending',
        '20261101000100-create-orders.js': 'pending',
        '20261101000200-create-password-tokens.js': 'pending',
        '20261101000300-add-enrollment-source.js': 'pending',
        '20261102000000-add-video-urls.js': 'pending',
        '20261102000100-create-materials.js': 'pending',
        '20261102000200-create-unit-quizzes.js': 'pending',
        '20261102000300-create-certificates.js': 'pending',
        '20261103000000-create-coupons.js': 'pending',
        '20261103000100-add-order-sales-fields.js': 'pending',
        '20261103000200-add-course-series.js': 'pending'
      });
      expect((await status(migrator)).executed).toHaveLength(2);
    });

    test('adopt registers only the baseline; up then needs the confirmation to drop the legacy rows', async () => {
      await adopt(migrator);
      expect((await status(migrator)).executed).toContain('20260101000000-baseline-schema.js');
      delete process.env.CONFIRM_DROP_LEGACY_PROGRESS;
      await expect(migrator.umzug.up()).rejects.toThrow(/CONFIRM_DROP_LEGACY_PROGRESS=yes/);
      process.env.CONFIRM_DROP_LEGACY_PROGRESS = 'yes';
      try { await migrator.umzug.up(); } finally { delete process.env.CONFIRM_DROP_LEGACY_PROGRESS; }
      expect((await status(migrator)).pending).toEqual([]);
      expect(diff(await schemaOf(DUMP_DB), await schemaOf(EMPTY_DB))).toEqual([]);
    });
  });

  describe('CLI', () => {
    const run = args => spawnSync('node', [path.resolve(__dirname, '..', 'src', 'db', 'migrate.js'), ...args], {
      env: { ...process.env, DB_NAME: EMPTY_DB }, encoding: 'utf8'
    });

    test('status lists the applied migrations', () => {
      const result = run(['status']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`${FILES.length} applied, 0 pending`);
    });

    test('down without --to or --last is refused, and unknown commands fail', () => {
      const down = run(['down']);
      expect(down.status).toBe(1);
      expect(down.stderr).toMatch(/--to <name>/);
      expect(run(['bogus']).status).toBe(1);
    });
  });
});
