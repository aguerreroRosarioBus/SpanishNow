// La base temporal debe caber sin truncamiento en el esquema W00 ya mergeado.
const { QueryTypes } = require('sequelize');
const sequelize = require('../src/config/database');
const { ClassSession, ClassSessionProposal } = require('../src/models');
const { createUser } = require('./helpers/fixtures');
const { resolveLocalIntent } = require('../src/domain/classTime');

test('TZ-01/05/T10: intención local y UTC sobreviven MySQL en otra zona sin reinterpretarse', async () => {
  const teacher = await createUser('teacher', 'w06-tiempo');
  const resolved = resolveLocalIntent({
    localStart: '2026-11-01T01:30', timeZone: 'America/New_York',
    offset: '-05:00', disambiguation: 'later', minutes: 50
  });
  await sequelize.transaction(async transaction => {
    await sequelize.query("SET time_zone = '+09:00'", { transaction });
    try {
      const session = await ClassSession.create({ ...resolved, teacherId: teacher.id, kind: 'individual', minutes: 50 }, { transaction });
      await ClassSessionProposal.create({
        ...resolved, sessionId: session.id, version: 1, kind: 'initial', minutes: 50,
        proposedById: teacher.id, expiresAt: new Date('2026-10-31T06:30:00Z')
      }, { transaction });
      const [row] = await sequelize.query(
        "SELECT localStart, utcOffset, DATE_FORMAT(startsAt, '%Y-%m-%d %H:%i:%s') AS raw FROM class_sessions WHERE id = ?",
        { replacements: [session.id], type: QueryTypes.SELECT, transaction }
      );
      expect(row).toEqual({ localStart: '2026-11-01T01:30', utcOffset: '-05:00', raw: '2026-11-01 06:30:00' });
      const restored = await ClassSession.findByPk(session.id, { transaction });
      expect(restored.startsAt.toISOString()).toBe(resolved.startsAt);
      expect(restored.endsAt.toISOString()).toBe(resolved.endsAt);
      expect(restored.disambiguation).toBe('later');
      const proposal = await ClassSessionProposal.findOne({ where: { sessionId: session.id }, transaction });
      expect(proposal.localStart).toBe(resolved.localStart);
      expect(proposal.startsAt.toISOString()).toBe(resolved.startsAt);
    } finally {
      await sequelize.query("SET time_zone = '+00:00'", { transaction });
    }
  });
});
