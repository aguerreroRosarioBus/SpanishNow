const User = require('./User');
const Course = require('./Course');
const Unit = require('./Unit');
const Story = require('./Story');
const Vocabulary = require('./Vocabulary');
const Question = require('./Question');
const Enrollment = require('./Enrollment');
const Progress = require('./Progress');

// Define associations
User.hasMany(Course, { foreignKey: 'teacherId', as: 'courses' });
Course.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });

Course.hasMany(Unit, { foreignKey: 'courseId', as: 'units', onDelete: 'CASCADE' });
Unit.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

Unit.hasMany(Story, { foreignKey: 'unitId', as: 'stories', onDelete: 'CASCADE' });
Story.belongsTo(Unit, { foreignKey: 'unitId', as: 'unit' });

Unit.hasMany(Vocabulary, { foreignKey: 'unitId', as: 'vocabulary', onDelete: 'CASCADE' });
Vocabulary.belongsTo(Unit, { foreignKey: 'unitId', as: 'unit' });

Story.hasMany(Question, { foreignKey: 'storyId', as: 'questions', onDelete: 'CASCADE' });
Question.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });

User.hasMany(Enrollment, { foreignKey: 'studentId', as: 'enrollments' });
Enrollment.belongsTo(User, { foreignKey: 'studentId', as: 'student' });

Course.hasMany(Enrollment, { foreignKey: 'courseId', as: 'enrollments' });
Enrollment.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

Enrollment.hasMany(Progress, { foreignKey: 'enrollmentId', as: 'progress', onDelete: 'CASCADE' });
Progress.belongsTo(Enrollment, { foreignKey: 'enrollmentId', as: 'enrollment' });

Story.hasMany(Progress, { foreignKey: 'storyId', as: 'progress' });
Progress.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });

module.exports = {
  User,
  Course,
  Unit,
  Story,
  Vocabulary,
  Question,
  Enrollment,
  Progress
};
