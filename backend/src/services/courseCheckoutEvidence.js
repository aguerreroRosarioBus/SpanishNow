const sequelize = require('../config/database');
const { Course } = require('../models');
const CourseCheckoutSnapshot = require('../models/CourseCheckoutSnapshot');
const sales = require('./salesExpectations');
const legal = require('./legalDocuments');

// Valida sin escribir: instantánea vista (hash) y aceptación de sus versiones exactas. No se deduce una aceptación del pago ni del redirect.
async function prepare(courseId, input = {}) {
  const course = await Course.findByPk(courseId);
  if (!course?.isPublished) throw legal.fail(404, 'not_found');
  const commercial = await sales.commercialView(course);
  const configured = commercial.version > 0 || commercial.legalDocuments.length > 0;
  if ((configured || input.commercialHash !== undefined) && commercial.hash !== input.commercialHash) throw legal.fail(409, 'sales_snapshot_changed');
  const locale = input.locale || 'en';
  legal.validateConsent(input.legalConsent, commercial.legalDocuments.filter(d => d.documentKey !== 'privacy'), locale);
  return { course, commercial, locale };
}

// Se persiste solo cuando el checkout ya no puede fallar por precio/cupón/email: junto a la orden, o antes de salir a Hotmart (sin orden).
async function record(user, { course, commercial, locale }, { orderId = null } = {}) {
  return sequelize.transaction(async transaction => {
    const docs = commercial.legalDocuments;
    const acceptedAt = docs.some(d => d.documentKey !== 'privacy') ? legal.persistedSecond(new Date()) : null;
    const evidence = await CourseCheckoutSnapshot.create({ courseId: course.id, userId: user?.id || null, orderId, snapshot: commercial, locale, acceptedAt }, { transaction });
    if (user) await legal.recordAcceptances(user.id, docs, { locale, context: 'checkout', contextType: 'course_checkout', contextId: evidence.id, acceptedAt, transaction });
    return evidence;
  });
}
module.exports = { prepare, record };
