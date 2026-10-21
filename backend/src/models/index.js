const User = require('./User');
const Course = require('./Course');
const Unit = require('./Unit');
const Story = require('./Story');
const Vocabulary = require('./Vocabulary');
const Question = require('./Question');
const Enrollment = require('./Enrollment');
const RepetitionActivity = require('./RepetitionActivity');
const Tooltip = require('./Tooltip');
const LessonPlan = require('./LessonPlan');
const LessonBlock = require('./LessonBlock');
const LessonProgress = require('./LessonProgress');
const LessonAnswer = require('./LessonAnswer');
const LessonReinforcement = require('./LessonReinforcement');

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

// RepetitionActivity associations
Story.hasMany(RepetitionActivity, { foreignKey: 'storyId', as: 'repetitionActivities', onDelete: 'CASCADE' });
RepetitionActivity.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });

// Tooltip associations
User.hasMany(Tooltip, { foreignKey: 'createdBy', as: 'tooltips' });
Tooltip.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

Story.hasMany(LessonPlan, { foreignKey: 'storyId', as: 'lessonPlans' });
LessonPlan.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
LessonPlan.hasMany(LessonBlock, { foreignKey: 'planId', as: 'blocks' });
LessonBlock.belongsTo(LessonPlan, { foreignKey: 'planId', as: 'plan' });
Enrollment.hasMany(LessonProgress, { foreignKey: 'enrollmentId', as: 'lessonProgress' });
LessonProgress.belongsTo(Enrollment, { foreignKey: 'enrollmentId', as: 'enrollment' });
LessonProgress.belongsTo(LessonPlan, { foreignKey: 'planId', as: 'plan' });
LessonProgress.hasMany(LessonAnswer, { foreignKey: 'lessonProgressId', as: 'answers' });
LessonProgress.hasMany(LessonReinforcement, { foreignKey: 'lessonProgressId', as: 'reinforcements' });

module.exports = {
  User,
  Course,
  Unit,
  Story,
  Vocabulary,
  Question,
  Enrollment,
  RepetitionActivity,
  Tooltip,
  LessonPlan,
  LessonBlock,
  LessonProgress,
  LessonAnswer,
  LessonReinforcement
};
