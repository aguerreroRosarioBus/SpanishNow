// Enrols every test student in the seeded course.
const { loadAccounts } = require('./lib/content');

module.exports = {
  name: 'enrollments',
  async run({ models: { User, Enrollment }, log, state }) {
    const courseId = state.content.course.id;
    for (const account of loadAccounts().accounts.filter(a => a.role === 'student')) {
      const student = await User.findOne({ where: { email: account.email, role: 'student' } });
      if (!student) throw new Error(`Student ${account.email} not found; the accounts seed must run first`);
      const [, created] = await Enrollment.findOrCreate({ where: { studentId: student.id, courseId }, defaults: { studentId: student.id, courseId } });
      log(`${created ? 'enrolled' : 'already enrolled'} ${account.email} in course ${courseId}`);
    }
  }
};
