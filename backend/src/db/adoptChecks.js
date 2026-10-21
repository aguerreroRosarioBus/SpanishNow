// Detectors used by `db:migrate:adopt`: for each legacy migration, decide from information_schema
// whether its effect is already present in the database. They only exist for migrations that predate
// the runner; a migration without a detector is always treated as pending (and runs normally).
//
// Each check returns { applied: boolean, evidence: string }.

const LEGACY_TABLES = ['progress', 'question_responses', 'activity_configs'];
const ENROLLMENT_FLAGS = ['questionsCompleted', 'flashcardsCompleted', 'matchingCompleted', 'listenRepeatCompleted'];
const LESSON_TABLES = ['lesson_plans', 'lesson_blocks', 'lesson_progress', 'lesson_answers', 'lesson_reinforcements'];
const CORE_TABLES = ['users', 'courses', 'units', 'stories', 'questions', 'vocabulary', 'repetition_activities', 'enrollments'];

async function createInspector(sequelize) {
  const rows = async (sql, replacements) => (await sequelize.query(sql, { replacements }))[0];
  const tables = new Set((await rows(
    'SELECT LOWER(TABLE_NAME) AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = \'BASE TABLE\''
  )).map(r => r.name));
  const columnCache = new Map();
  const indexCache = new Map();

  const inspector = {
    tables,
    hasTable: name => tables.has(name.toLowerCase()),
    async columns(table) {
      if (!columnCache.has(table)) {
        columnCache.set(table, new Map((await rows(
          'SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = :table',
          { table: table.toLowerCase() }
        )).map(r => [r.name, r.type])));
      }
      return columnCache.get(table);
    },
    async hasColumn(table, column) { return (await inspector.columns(table)).has(column); },
    async indexes(table) {
      if (!indexCache.has(table)) {
        indexCache.set(table, new Set((await rows(
          'SELECT DISTINCT INDEX_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = :table',
          { table: table.toLowerCase() }
        )).map(r => r.name)));
      }
      return indexCache.get(table);
    },
    count: async sql => Number((await rows(sql))[0].total),
    sequelize
  };
  return inspector;
}

/** The 20261022 end state: legacy tables and enrollment flags gone, on top of the lesson tables. */
async function legacyDropped(i) {
  if (!i.hasTable('lesson_plans') || !i.hasTable('enrollments')) return false;
  if (LEGACY_TABLES.some(t => i.hasTable(t))) return false;
  const columns = await i.columns('enrollments');
  return !ENROLLMENT_FLAGS.some(flag => columns.has(flag));
}

const yes = evidence => ({ applied: true, evidence });
const no = evidence => ({ applied: false, evidence });

const adoptChecks = {
  async '20260101000000-baseline-schema.js'(i) {
    const missing = CORE_TABLES.filter(t => !i.hasTable(t));
    return missing.length ? no(`missing tables: ${missing.join(', ')}`) : yes(`all ${CORE_TABLES.length} base tables exist`);
  },

  async '20260115131716-create-activity-config.js'(i) {
    if (i.hasTable('activity_configs')) return yes('table activity_configs exists');
    if (await legacyDropped(i)) return yes('activity_configs was created and later dropped (legacy progress removed)');
    return no('activity_configs does not exist');
  },

  async '20260115132247-add-activity-flags-to-enrollment.js'(i) {
    if (!i.hasTable('enrollments')) return no('enrollments does not exist');
    if (await i.hasColumn('enrollments', 'questionsCompleted')) return yes('enrollments.questionsCompleted exists');
    if (await legacyDropped(i)) return yes('flags were added and later dropped (legacy progress removed)');
    return no('enrollments has no activity flags');
  },

  async '20260122000000-add-audio-to-questions.js'(i) {
    if (!i.hasTable('questions')) return no('questions does not exist');
    return (await i.hasColumn('questions', 'audioUrl')) ? yes('questions.audioUrl exists') : no('questions.audioUrl missing');
  },

  async '20260127000000-create-tooltips.js'(i) {
    return i.hasTable('tooltips') ? yes('table tooltips exists') : no('table tooltips missing');
  },

  async '20260926000000-convert-activity-configs-to-story.js'(i) {
    if (i.hasTable('activity_configs')) {
      const columns = await i.columns('activity_configs');
      if (columns.has('storyId') && !columns.has('unitId')) return yes('activity_configs is already story-scoped');
      return no('activity_configs still has the legacy unitId column');
    }
    if (await legacyDropped(i)) return yes('activity_configs no longer exists (legacy progress removed)');
    return no('activity_configs does not exist yet; nothing to convert, the migration is a no-op when it runs');
  },

  async '20260927000000-create-lesson-plans.js'(i) {
    const missing = LESSON_TABLES.filter(t => !i.hasTable(t));
    if (missing.length) return no(`missing tables: ${missing.join(', ')}`);
    const expected = {
      lesson_plans: 'lesson_plan_story_revision', lesson_blocks: 'lesson_block_key', lesson_progress: 'lesson_progress_assignment',
      lesson_answers: 'lesson_answer_attempt', lesson_reinforcements: 'lesson_reinforcement_block'
    };
    for (const [table, index] of Object.entries(expected)) {
      if (!(await i.indexes(table)).has(index)) return no(`index ${index} missing on ${table}`);
    }
    const unplanned = await i.count(
      'SELECT COUNT(*) AS total FROM stories s WHERE NOT EXISTS (SELECT 1 FROM lesson_plans p WHERE p.storyId = s.id)'
    );
    return unplanned
      ? no(`${unplanned} stories have no lesson plan (the migration is idempotent and will backfill them)`)
      : yes('lesson tables, unique indexes and one plan per story exist');
  },

  async '20261021000000-add-keyframe-tooltips.js'(i) {
    if (!i.hasTable('tooltips')) return no('tooltips does not exist');
    const columns = await i.columns('tooltips');
    if (!columns.has('blockKey')) return no('tooltips.blockKey missing');
    if (!String(columns.get('targetType')).includes("'keyframe'")) return no("tooltips.targetType has no 'keyframe' value");
    if (!(await i.indexes('tooltips')).has('idx_tooltip_keyframe')) return no('index idx_tooltip_keyframe missing');
    return yes("tooltips.blockKey, targetType 'keyframe' and idx_tooltip_keyframe exist");
  },

  async '20261022000000-drop-legacy-progress.js'(i) {
    return (await legacyDropped(i))
      ? yes('progress, question_responses, activity_configs and the enrollment flags are already gone')
      : no('legacy progress tables or enrollment flags still exist');
  }
};

module.exports = { adoptChecks, createInspector, CORE_TABLES };
