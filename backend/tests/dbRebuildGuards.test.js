// Safety guards of scripts/db-rebuild.sh. Every case here fails (or stops at --dry-run) before any connection is opened.
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'db-rebuild.sh');
const RAILWAY = {
  RAILWAY_DB_HOST: 'db.railway.invalid', RAILWAY_DB_PORT: '12345', RAILWAY_DB_USER: 'u',
  RAILWAY_DB_PASSWORD: 'super-secret-pw-123', RAILWAY_DB_NAME: 'railway', SEED_TEST_PASSWORD: 'seed-secret-pw-456'
};

function rebuild(args, env = {}) {
  // Minimal environment: nothing from the developer's shell or backend/.env decides what the script targets.
  const base = { PATH: process.env.PATH, HOME: process.env.HOME };
  const result = spawnSync('bash', [SCRIPT, ...args], { env: { ...base, ...env }, encoding: 'utf8', input: '' });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

describe('scripts/db-rebuild.sh guards', () => {
  test('local: refuses the development database without --force-dev-db', () => {
    const r = rebuild(['--target', 'local', '--db', 'spanishnow', '--yes']);
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/development database.*--force-dev-db/);
  });

  test('local: refuses a non-local host', () => {
    const r = rebuild(['--target', 'local', '--db', 'x_test', '--yes'], { DB_HOST: 'db.example.com' });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/refuses host 'db.example.com'/);
  });

  test('local: needs --db and a sane name', () => {
    expect(rebuild(['--target', 'local', '--yes'], { DB_HOST: 'localhost' }).output).toMatch(/--db is required/);
    expect(rebuild(['--target', 'local', '--db', 'a;DROP', '--yes'], { DB_HOST: 'localhost' }).output).toMatch(/invalid database name/);
  });

  test('requires a valid --target', () => {
    expect(rebuild(['--db', 'x_test', '--yes']).status).toBe(1);
    expect(rebuild(['--target', 'prod', '--db', 'x_test']).status).toBe(1);
  });

  test('railway: every connection variable must come from RAILWAY_DB_*, never from backend/.env', () => {
    const r = rebuild(['--target', 'railway', '--yes'], { DB_HOST: 'x', DB_USER: 'x', DB_PASSWORD: 'x', DB_NAME: 'x' });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/RAILWAY_DB_HOST must be set/);
    const partial = rebuild(['--target', 'railway', '--yes'], { ...RAILWAY, RAILWAY_DB_PASSWORD: '' });
    expect(partial.output).toMatch(/RAILWAY_DB_PASSWORD must be set/);
  });

  test('railway: needs --yes, the test accounts password, and a host that is not this machine', () => {
    expect(rebuild(['--target', 'railway'], RAILWAY).output).toMatch(/needs --yes/);
    expect(rebuild(['--target', 'railway', '--yes'], { ...RAILWAY, SEED_TEST_PASSWORD: '' }).output).toMatch(/SEED_TEST_PASSWORD must be set/);
    expect(rebuild(['--target', 'railway', '--yes'], { ...RAILWAY, RAILWAY_DB_HOST: 'localhost' }).output).toMatch(/use --target local/);
    expect(rebuild(['--target', 'railway', '--db', 'other', '--yes'], RAILWAY).output).toMatch(/differs from RAILWAY_DB_NAME/);
  });

  test('dry run prints the plan, executes nothing and never prints a password', () => {
    const r = rebuild(['--target', 'railway', '--yes', '--dry-run'], RAILWAY);
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/Nothing was executed/);
    expect(r.output).toMatch(/drop every table/);
    expect(r.output).not.toContain(RAILWAY.RAILWAY_DB_PASSWORD);
    expect(r.output).not.toContain(RAILWAY.SEED_TEST_PASSWORD);
    const local = rebuild(['--target', 'local', '--db', 'spanishnow_jest_test_nothing', '--dry-run'], { DB_HOST: '127.0.0.1', DB_PASSWORD: 'local-secret-pw' });
    expect(local.status).toBe(0);
    expect(local.output).not.toContain('local-secret-pw');
  });
});
