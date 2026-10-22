const sequelize = require('../config/database');
const { Course } = require('../models');
const CourseCheckoutSnapshot = require('../models/CourseCheckoutSnapshot');
const sales = require('./salesExpectations');
const legal = require('./legalDocuments');

// Se persiste antes de salir al proveedor. No se deduce una aceptación del pago ni del redirect.
async function capture(user, courseId, input = {}) {
  return sequelize.transaction(async transaction => {
    const course = await Course.findByPk(courseId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!course?.isPublished) throw legal.fail(404, 'not_found');
    const commercial = await sales.commercialView(course, { transaction });
    const configured = commercial.version > 0 || commercial.legalDocuments.length > 0;
    if ((configured || input.commercialHash !== undefined) && commercial.hash !== input.commercialHash) throw legal.fail(409, 'sales_snapshot_changed');
    const locale = input.locale || 'en';
    const docs = commercial.legalDocuments;
    legal.validateConsent(input.legalConsent, docs.filter(d => d.documentKey !== 'privacy'), locale);
    const acceptedAt = docs.some(d => d.documentKey !== 'privacy') ? new Date() : null;
    const evidence = await CourseCheckoutSnapshot.create({ courseId, userId: user?.id || null, snapshot: commercial, locale, acceptedAt }, { transaction });
    if (user) await legal.recordAcceptances(user.id, docs, { locale, context: 'checkout', contextType: 'course_checkout', contextId: evidence.id, acceptedAt, transaction });
    return { course, evidence };
  });
}
async function link(evidenceId, orderId) {
  if (evidenceId) await CourseCheckoutSnapshot.update({ orderId }, { where: { id: evidenceId, orderId: null } });
}
module.exports = { capture, link };
