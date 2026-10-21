const { Enrollment } = require('../models');

/** True when the user teaches the course or is a student enrolled in it. */
async function canReadCourse(user, course) {
  if (!user || !course) return false;
  if (user.role === 'teacher') return course.teacherId === user.id;
  if (user.role === 'student') {
    return Boolean(await Enrollment.findOne({ where: { studentId: user.id, courseId: course.id } }));
  }
  return false;
}

module.exports = { canReadCourse };
