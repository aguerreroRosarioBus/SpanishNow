'use strict';

// Legacy unit settings are expanded to every story in the unit. When a story
// already has its own setting for the same activity, that story setting wins.
// This migration is intentionally forward-only: the expanded copies cannot be
// unambiguously collapsed back into unit settings after story-level edits.
module.exports = {
  async up(q, S) {
    const tables = await q.showAllTables();
    const hasTable = tables.some(t => String(typeof t === 'string' ? t : Object.values(t)[0]).toLowerCase() === 'activity_configs');
    if (!hasTable) return;

    let columns = await q.describeTable('activity_configs');
    if (!columns.unitId) {
      if (!columns.storyId) throw new Error('activity_configs must contain storyId or legacy unitId');
      return;
    }

    const sequelize = q.sequelize;
    const [legacyRows] = await sequelize.query('SELECT * FROM activity_configs WHERE unitId IS NOT NULL ORDER BY id');
    const [stories] = await sequelize.query('SELECT id, unitId FROM stories ORDER BY unitId, id');
    const byUnit = new Map();
    for (const story of stories) {
      if (!byUnit.has(story.unitId)) byUnit.set(story.unitId, []);
      byUnit.get(story.unitId).push(story.id);
    }

    // Fail before altering the schema if a legacy row cannot be assigned.
    const unmappable = legacyRows.filter(row => !(byUnit.get(row.unitId) || []).length);
    if (unmappable.length) {
      throw new Error(`Cannot convert activity_configs rows without stories in their unit: ${unmappable.map(row => row.id).join(', ')}`);
    }

    if (!columns.storyId) {
      await q.addColumn('activity_configs', 'storyId', { type: S.INTEGER, allowNull: true });
      columns = await q.describeTable('activity_configs');
    }

    let conflicts = 0;
    for (const legacy of legacyRows) {
      const targetStoryIds = byUnit.get(legacy.unitId) || [];
      let keptLegacyRow = legacy.storyId != null;
      for (const storyId of targetStoryIds) {
        if (legacy.storyId != null && storyId === legacy.storyId) continue;
        const [existing] = await sequelize.query(
          'SELECT id FROM activity_configs WHERE storyId = :storyId AND activityType = :activityType AND id <> :id LIMIT 1',
          { replacements: { storyId, activityType: legacy.activityType, id: legacy.id } }
        );
        if (existing.length) {
          conflicts++;
          continue;
        }

        if (!keptLegacyRow) {
          await q.bulkUpdate('activity_configs', { storyId }, { id: legacy.id });
          keptLegacyRow = true;
        } else {
          const copy = { ...legacy, storyId };
          delete copy.id;
          if (copy.requiredStoryIds != null && typeof copy.requiredStoryIds !== 'string') {
            copy.requiredStoryIds = JSON.stringify(copy.requiredStoryIds);
          }
          await q.bulkInsert('activity_configs', [copy]);
        }
      }

      // If every target already had a story-specific setting, discard only
      // this superseded legacy row. The story-specific rows remain untouched.
      if (!keptLegacyRow) await q.bulkDelete('activity_configs', { id: legacy.id });
    }

    const [duplicates] = await sequelize.query(
      'SELECT storyId, activityType, COUNT(*) AS count FROM activity_configs GROUP BY storyId, activityType HAVING COUNT(*) > 1'
    );
    if (duplicates.length) {
      throw new Error(`Duplicate story activity settings must be resolved before migration: ${JSON.stringify(duplicates)}`);
    }
    const [unassigned] = await sequelize.query('SELECT id FROM activity_configs WHERE storyId IS NULL');
    if (unassigned.length) throw new Error(`Unassigned activity_configs remain: ${unassigned.map(row => row.id).join(', ')}`);

    const [unitForeignKeys] = await sequelize.query(
      "SELECT CONSTRAINT_NAME AS constraintName FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activity_configs' AND COLUMN_NAME = 'unitId' AND REFERENCED_TABLE_NAME IS NOT NULL"
    );
    for (const constraint of unitForeignKeys) {
      await q.removeConstraint('activity_configs', constraint.constraintName);
    }
    for (const index of await q.showIndex('activity_configs')) {
      if ((index.fields || []).some(field => field.attribute === 'unitId')) {
        await q.removeIndex('activity_configs', index.name);
      }
    }
    await q.removeColumn('activity_configs', 'unitId');
    await q.changeColumn('activity_configs', 'storyId', {
      type: S.INTEGER, allowNull: false,
      references: { model: 'stories', key: 'id' }, onDelete: 'CASCADE'
    });

    const indexes = await q.showIndex('activity_configs');
    if (!indexes.some(index => (index.fields || []).some(field => field.attribute === 'storyId'))) {
      await q.addIndex('activity_configs', ['storyId'], { name: 'idx_activity_configs_story' });
    }
    if (!indexes.some(index => index.unique && index.fields?.length === 2 &&
      index.fields[0].attribute === 'storyId' && index.fields[1].attribute === 'activityType')) {
      await q.addIndex('activity_configs', ['storyId', 'activityType'], {
        name: 'unique_story_activity', unique: true
      });
    }
    if (!indexes.some(index => index.fields?.length === 1 && index.fields[0].attribute === 'order')) {
      await q.addIndex('activity_configs', ['order'], { name: 'idx_activity_configs_order' });
    }

    if (conflicts) console.warn(`Preserved story-specific activity settings for ${conflicts} unit-to-story conflicts.`);
  },

  async down() {
    throw new Error('Irreversible migration: restore the pre-migration database backup to return to unit-scoped activity configs.');
  }
};
