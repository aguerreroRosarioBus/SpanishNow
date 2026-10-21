// Series of courses: the course offered after finishing one, with the coupon the teacher attached to the offer.
const { Course, Coupon, Enrollment } = require('../models');
const { applyToCourse, CouponError } = require('./couponService');

/**
 * The offer shown at the end of an enrolment's course:
 *   { course: { id, slug, title, price, currency }, couponCode: string | null, alreadyEnrolled: boolean } or null.
 * Null unless the course has a next course and it is published. The coupon code is included only while it would work
 * for the next course (active, not expired, uses left, same currency...) and the student does not own the course yet.
 */
async function nextCourseOffer(enrollment) {
  const course = enrollment.course || await Course.findByPk(enrollment.courseId);
  if (!course || !course.nextCourseId) return null;
  const next = await Course.findOne({ where: { id: course.nextCourseId, isPublished: true } });
  if (!next) return null;

  const alreadyEnrolled = Boolean(await Enrollment.findOne({ where: { studentId: enrollment.studentId, courseId: next.id }, attributes: ['id'] }));
  let couponCode = null;
  if (!alreadyEnrolled && course.nextCourseCouponId) {
    const coupon = await Coupon.findByPk(course.nextCourseCouponId);
    if (coupon) {
      try {
        applyToCourse(coupon, next);
        couponCode = coupon.code;
      } catch (error) {
        if (!(error instanceof CouponError)) throw error;
      }
    }
  }
  return { course: { id: next.id, slug: next.slug, title: next.title, price: next.price, currency: next.currency }, couponCode, alreadyEnrolled };
}

module.exports = { nextCourseOffer };
