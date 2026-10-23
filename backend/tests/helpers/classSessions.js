const { randomUUID } = require('node:crypto');
const M = require('../../src/models');
const sequelize = require('../../src/config/database');
const credits = require('../../src/services/classCredits');
const { DEFAULT_POLICY_V1 } = require('../../src/domain/classPolicy');
const { createUser } = require('./fixtures');
const uuid = () => randomUUID().replaceAll('-', '');

async function chain({ size = 1, units = 4, teacher: existingTeacher, students: existingStudents, billing = size === 2 ? 'per_group' : size === 3 ? 'per_seat' : 'per_buyer' } = {}) {
  const teacher = existingTeacher || await createUser('teacher', 'agenda-docente');
  await teacher.update({ timeZone: 'America/New_York', timeZoneConfirmedAt: new Date() });
  await M.TeacherClassSettings.upsert({ userId: teacher.id, classesEnabledAt: new Date(), acceptsInquiries: true });
  const students = existingStudents || await Promise.all(Array.from({ length: size }, () => createUser('student', 'agenda-alumno')));
  for (const student of students) await student.update({ timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: new Date() });
  const policy = await M.ClassPolicyVersion.create({ version: 100000 + Math.floor(Math.random() * 1e9), rules: DEFAULT_POLICY_V1 });
  const template = await M.ClassPackageTemplate.create({ teacherId: teacher.id, templateKey: `agenda-${uuid()}` });
  const terms = await M.ClassPackageTemplateVersion.create({ templateId: template.id, version: 1, nameEn: 'Classes', nameEs: 'Clases',
    modality: size === 1 ? 'individual' : 'group', groupSize: size, billing, sessionsCount: units, minutesPerSession: 50,
    seatsCovered: billing === 'per_group' ? size : 1, priceAmount: 9000, currency: 'USD', validityHours: 2160, policyVersionId: policy.id });
  const cohort = size > 1 ? await M.ClassCohort.create({ teacherId: teacher.id, templateVersionId: terms.id, groupSize: size,
    formingDeadlineAt: new Date(Date.now() + 6 * 86400e3), tentativeStartsAt: new Date(Date.now() + 7 * 86400e3) }) : null;
  const conversations = [];
  for (const student of students) {
    const [conversation] = await M.Conversation.findOrCreate({ where: { teacherId: teacher.id, studentId: student.id }, defaults: { createdById: student.id } });
    for (const user of [teacher, student]) await M.ConversationParticipant.findOrCreate({ where: { conversationId: conversation.id, userId: user.id }, defaults: { role: user.role } });
    conversations.push(conversation);
    if (cohort) await M.ClassCohortMember.create({ cohortId: cohort.id, userId: student.id, status: 'accepted', invitedById: teacher.id });
  }
  const purchases = [];
  for (const student of billing === 'per_group' ? [students[0]] : students) {
    const index = students.indexOf(student);
    const offer = await M.ClassOffer.create({ conversationId: conversations[index].id, teacherId: teacher.id, buyerId: student.id,
      cohortId: cohort?.id, templateVersionId: terms.id, policyVersionId: policy.id, status: 'paid', snapshot: { ...terms.toJSON(), rules: policy.rules },
      amount: 9000, currency: 'USD', sessionsCount: units, minutesPerSession: 50, seatsCovered: terms.seatsCovered, validityHours: 2160,
      expiresAt: new Date(Date.now() + 6 * 86400e3) });
    const order = await M.ClassPackageOrder.create({ offerId: offer.id, buyerId: student.id, amount: 9000, currency: 'USD', provider: 'fake', status: 'paid', checkoutRef: uuid(), paidAt: new Date() });
    const purchase = await M.ClassPackagePurchase.create({ orderId: order.id, offerId: offer.id, teacherId: teacher.id, buyerId: student.id,
      cohortId: cohort?.id, templateVersionId: terms.id, policyVersionId: policy.id, snapshot: offer.snapshot,
      minutesPerSession: 50, seatsCovered: terms.seatsCovered, paidAt: new Date(), expiresAt: new Date(Date.now() + 2160 * 3600e3) });
    for (const beneficiary of billing === 'per_group' ? students : [student]) await M.ClassPackageBeneficiary.create({ purchaseId: purchase.id, userId: beneficiary.id });
    await sequelize.transaction(transaction => credits.apply({ purchaseId: purchase.id, operation: 'grant', units, operationKey: `grant:order:${order.id}` }, { transaction }));
    purchases.push(purchase);
  }
  const date = new Date(Date.now() + 4 * 86400e3).toISOString().slice(0, 10);
  const body = { intent: { localStart: `${date}T09:00`, timeZone: 'America/New_York', offset: '-04:00', minutes: 50 },
    participants: students.map((s, i) => ({ userId: s.id, purchaseId: purchases[billing === 'per_group' ? 0 : i].id })), ...(cohort ? { cohortId: cohort.id } : {}) };
  // El fixture usa el offset de la fecha real, incluso cuando se ejecuta fuera de octubre.
  const { Temporal } = require('@js-temporal/polyfill');
  body.intent.offset = Temporal.PlainDateTime.from(body.intent.localStart).toZonedDateTime(body.intent.timeZone).offset;
  return { teacher, students, purchases, cohort, conversations, body, policy, terms };
}
module.exports = { chain, uuid };
