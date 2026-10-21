// Curated, idempotent seeds.   node src/db/seed.js [--only <name>] [--force-plans] [--sync-content] [--reset-passwords]
//
//   accounts        test teacher + student (seeds/local-test-accounts.json)
//   course-content  course, units, stories, questions, vocabulary (seeds/content/*.json)
//   lesson-plans    initial published revision per story + curated plans (story JSON `plan`)
//   enrollments     test student enrolled in the course
//
// Target: DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME. On a non-local host SEED_TEST_PASSWORD is required.
// Run `npm run db:migrate` first. Safe to run repeatedly (see each seed's header for what it never overwrites).
require('dotenv').config({ quiet: true });
const path = require('path');
const sequelize = require('../config/database');
const models = require('../models');

const SEEDS = ['01-accounts', '02-course-content', '03-lesson-plans', '04-enrollments']
  .map(file => require(path.resolve(__dirname, '..', '..', 'seeds', 'curated', file)));

function parseArgs(argv) {
  const options = { only: null, forcePlans: false, syncContent: false, resetPasswords: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--only') options.only = argv[++i];
    else if (arg === '--force-plans') options.forcePlans = true;
    else if (arg === '--sync-content') options.syncContent = true;
    else if (arg === '--reset-passwords') options.resetPasswords = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.only && !SEEDS.some(s => s.name === options.only)) throw new Error(`--only must be one of: ${SEEDS.map(s => s.name).join(', ')}`);
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { host, port, database } = sequelize.config;
  console.log(`Database: ${host}:${port}/${database}`);
  await sequelize.authenticate();
  const state = {};
  // `--only` still loads the content (cheap, no writes) so later seeds can run on their own.
  if (options.only && options.only !== 'course-content') state.content = require('../../seeds/curated/lib/content').loadContent();
  for (const seed of SEEDS) {
    if (options.only && options.only !== seed.name) continue;
    console.log(`\n[${seed.name}]`);
    await seed.run({ models, sequelize, options, state, log: message => console.log(`  ${message}`) });
  }
  console.log('\nSeed complete.');
}

main()
  .then(() => sequelize.close())
  .catch(async error => {
    console.error(`\nSeed failed: ${error.message}`);
    process.exitCode = 1;
    await sequelize.close().catch(() => {});
  });
