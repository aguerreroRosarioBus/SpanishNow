// Curso de prueba gratis (docs/curso-prueba/PLAN.md).   node src/db/seedTrial.js [--only <paso>] [--sync-content] [--force-plans]
//
//   course-content  curso, unidad, vocabulario, historias y preguntas (seeds/content-trial/*.json, sin ids)
//   lesson-plans    plan de cada historia, publicado con el servicio de la API
//   glosses         tooltips de los keyframes
//   media           audio con voz sintética, ilustraciones y «escuchar y repetir» (solo si hay dónde subir archivos)
//   extras          cuestionario final, video provisorio, PDF y curso siguiente
//
// El docente sale de TRIAL_COURSE_TEACHER_EMAIL (en una base local, admin@gmail.com por defecto) y debe existir: no crea cuentas.
// TRIAL_COURSE_SLUG cambia el slug del curso (el registro lo usa para inscribir); TRIAL_COURSE_NEXT_SLUG enlaza el curso pago siguiente.
// Por defecto solo crea lo que falta y nunca pisa lo que un docente editó. Es seguro correrla varias veces.
require('dotenv').config({ quiet: true });
const path = require('path');
const sequelize = require('../config/database');
const models = require('../models');
const { loadTrialContent } = require('../../seeds/trial/lib/content');

const STEPS = ['01-course-content', '02-lesson-plans', '03-glosses', '04-media', '05-extras']
  .map(file => require(path.resolve(__dirname, '..', '..', 'seeds', 'trial', file)));

function parseArgs(argv) {
  const options = { only: null, forcePlans: false, syncContent: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--only') options.only = argv[++i];
    else if (arg === '--force-plans') options.forcePlans = true;
    else if (arg === '--sync-content') options.syncContent = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  if (options.only && !STEPS.some(s => s.name === options.only)) throw new Error(`--only debe ser uno de: ${STEPS.map(s => s.name).join(', ')}`);
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const content = loadTrialContent(); // valida los archivos antes de tocar la base
  const { host, port, database } = sequelize.config;
  console.log(`Base de datos: ${host}:${port}/${database}`);
  await sequelize.authenticate();
  for (const step of STEPS) {
    if (options.only && options.only !== step.name) continue;
    console.log(`\n[${step.name}]`);
    await step.run({ models, sequelize, options, content, log: message => console.log(`  ${message}`) });
  }
  console.log('\nSemilla del curso de prueba completa.');
}

main()
  .then(() => sequelize.close())
  .catch(async error => {
    console.error(`\nLa semilla del curso de prueba falló: ${error.message}`);
    process.exitCode = 1;
    await sequelize.close().catch(() => {});
  });
