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
const Order = require('./Order');
const PasswordToken = require('./PasswordToken');
const Material = require('./Material');
const UnitQuiz = require('./UnitQuiz');
const UnitQuizQuestion = require('./UnitQuizQuestion');
const UnitQuizAttempt = require('./UnitQuizAttempt');
const Certificate = require('./Certificate');
const Coupon = require('./Coupon');

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

// Sales
Course.hasMany(Order, { foreignKey: 'courseId', as: 'orders' });
Order.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Order.hasMany(Enrollment, { foreignKey: 'orderId', as: 'enrollments' });
Enrollment.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
User.hasMany(PasswordToken, { foreignKey: 'userId', as: 'passwordTokens', onDelete: 'CASCADE' });
PasswordToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Phase 2: materials, unit quizzes and certificates
Course.hasMany(Material, { foreignKey: 'courseId', as: 'materials', onDelete: 'CASCADE' });
Material.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
Unit.hasMany(Material, { foreignKey: 'unitId', as: 'materials', onDelete: 'CASCADE' });
Material.belongsTo(Unit, { foreignKey: 'unitId', as: 'unit' });
Story.hasMany(Material, { foreignKey: 'storyId', as: 'materials', onDelete: 'CASCADE' });
Material.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });

Unit.hasOne(UnitQuiz, { foreignKey: 'unitId', as: 'quiz', onDelete: 'CASCADE' });
UnitQuiz.belongsTo(Unit, { foreignKey: 'unitId', as: 'unit' });
UnitQuiz.hasMany(UnitQuizQuestion, { foreignKey: 'quizId', as: 'questions', onDelete: 'CASCADE' });
UnitQuizQuestion.belongsTo(UnitQuiz, { foreignKey: 'quizId', as: 'quiz' });
UnitQuiz.hasMany(UnitQuizAttempt, { foreignKey: 'quizId', as: 'attempts', onDelete: 'CASCADE' });
UnitQuizAttempt.belongsTo(UnitQuiz, { foreignKey: 'quizId', as: 'quiz' });
Enrollment.hasMany(UnitQuizAttempt, { foreignKey: 'enrollmentId', as: 'quizAttempts', onDelete: 'CASCADE' });
UnitQuizAttempt.belongsTo(Enrollment, { foreignKey: 'enrollmentId', as: 'enrollment' });
Enrollment.hasOne(Certificate, { foreignKey: 'enrollmentId', as: 'certificate', onDelete: 'CASCADE' });
Certificate.belongsTo(Enrollment, { foreignKey: 'enrollmentId', as: 'enrollment' });

// Phase 3: coupons and course series
User.hasMany(Coupon, { foreignKey: 'teacherId', as: 'coupons' });
Coupon.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });
Course.hasMany(Coupon, { foreignKey: 'courseId', as: 'coupons' });
Coupon.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
Coupon.hasMany(Order, { foreignKey: 'couponId', as: 'orders' });
Order.belongsTo(Coupon, { foreignKey: 'couponId', as: 'coupon' });
Course.belongsTo(Course, { foreignKey: 'nextCourseId', as: 'nextCourse' });
Course.belongsTo(Coupon, { foreignKey: 'nextCourseCouponId', as: 'nextCourseCoupon' });

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
  LessonReinforcement,
  Order,
  PasswordToken,
  Material,
  UnitQuiz,
  UnitQuizQuestion,
  UnitQuizAttempt,
  Certificate,
  Coupon
};
