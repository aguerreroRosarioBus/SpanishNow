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
const Affiliate = require('./Affiliate');
const AffiliatePayout = require('./AffiliatePayout');
const LessonComment = require('./LessonComment');
const LiveClass = require('./LiveClass');
const LiveClassMember = require('./LiveClassMember');
const GoogleConnection = require('./GoogleConnection');
// W00: classes, chat, packages and integrations (docs/clases-chat-integraciones/CONTRATO.md)
const TeacherClassSettings = require('./TeacherClassSettings');
const Conversation = require('./Conversation');
const ConversationParticipant = require('./ConversationParticipant');
const Message = require('./Message');
const RateLimitBucket = require('./RateLimitBucket');
const ClassPolicyVersion = require('./ClassPolicyVersion');
const ClassPackageTemplate = require('./ClassPackageTemplate');
const ClassPackageTemplateVersion = require('./ClassPackageTemplateVersion');
const ClassCohort = require('./ClassCohort');
const ClassCohortMember = require('./ClassCohortMember');
const ClassOffer = require('./ClassOffer');
const ClassOfferBeneficiary = require('./ClassOfferBeneficiary');
const ClassPackageOrder = require('./ClassPackageOrder');
const PaymentProviderEvent = require('./PaymentProviderEvent');
const ClassPackagePurchase = require('./ClassPackagePurchase');
const ClassPackageBeneficiary = require('./ClassPackageBeneficiary');
const ClassCreditLedger = require('./ClassCreditLedger');
const ClassSession = require('./ClassSession');
const ClassSessionProposal = require('./ClassSessionProposal');
const ClassSessionParticipant = require('./ClassSessionParticipant');
const ExternalConnection = require('./ExternalConnection');
const ExternalSyncRef = require('./ExternalSyncRef');
const ExternalCalendarChannel = require('./ExternalCalendarChannel');
const OutboxJob = require('./OutboxJob');
const LegalAcceptance = require('./LegalAcceptance');
const LegalDocument = require('./LegalDocument');
const CourseExpectations = require('./CourseExpectations');
const CourseCheckoutSnapshot = require('./CourseCheckoutSnapshot');
const ClassPackageProviderVerification = require('./ClassPackageProviderVerification');
const AuditLog = require('./AuditLog');

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

// Phase 4: affiliates, lesson comments
User.hasMany(Affiliate, { foreignKey: 'teacherId', as: 'affiliates' });
Affiliate.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });
Affiliate.hasMany(AffiliatePayout, { foreignKey: 'affiliateId', as: 'payouts', onDelete: 'CASCADE' });
AffiliatePayout.belongsTo(Affiliate, { foreignKey: 'affiliateId', as: 'affiliate' });
Affiliate.hasMany(Order, { foreignKey: 'affiliateId', as: 'orders' });
Order.belongsTo(Affiliate, { foreignKey: 'affiliateId', as: 'affiliate' });

Story.hasMany(LessonComment, { foreignKey: 'storyId', as: 'comments', onDelete: 'CASCADE' });
LessonComment.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
User.hasMany(LessonComment, { foreignKey: 'userId', as: 'comments', onDelete: 'CASCADE' });
LessonComment.belongsTo(User, { foreignKey: 'userId', as: 'author' });
LessonComment.hasMany(LessonComment, { foreignKey: 'parentId', as: 'replies', onDelete: 'CASCADE' });
LessonComment.belongsTo(LessonComment, { foreignKey: 'parentId', as: 'parent' });

User.hasMany(LiveClass, { foreignKey: 'teacherId', as: 'liveClasses' });
LiveClass.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });
Course.hasMany(LiveClass, { foreignKey: 'courseId', as: 'liveClasses' });
LiveClass.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
LiveClass.hasMany(LiveClassMember, { foreignKey: 'liveClassId', as: 'members', onDelete: 'CASCADE' });
LiveClassMember.belongsTo(LiveClass, { foreignKey: 'liveClassId', as: 'liveClass' });
LiveClassMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });
GoogleConnection.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// W00: classes, chat, packages and integrations
User.hasOne(TeacherClassSettings, { foreignKey: 'userId', as: 'classSettings' });
TeacherClassSettings.belongsTo(User, { foreignKey: 'userId', as: 'teacher' });

Conversation.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });
Conversation.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
Conversation.hasMany(ConversationParticipant, { foreignKey: 'conversationId', as: 'participants' });
ConversationParticipant.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
ConversationParticipant.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Conversation.hasMany(Message, { foreignKey: 'conversationId', as: 'messages' });
Message.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });

ClassPackageTemplate.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });
ClassPackageTemplate.hasMany(ClassPackageTemplateVersion, { foreignKey: 'templateId', as: 'versions' });
ClassPackageTemplate.belongsTo(ClassPackageTemplateVersion, { foreignKey: 'currentVersionId', as: 'currentVersion', constraints: false });
ClassPackageTemplateVersion.belongsTo(ClassPackageTemplate, { foreignKey: 'templateId', as: 'template' });
ClassPackageTemplateVersion.belongsTo(ClassPolicyVersion, { foreignKey: 'policyVersionId', as: 'policy' });

ClassCohort.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });
ClassCohort.belongsTo(ClassPackageTemplateVersion, { foreignKey: 'templateVersionId', as: 'templateVersion' });
ClassCohort.hasMany(ClassCohortMember, { foreignKey: 'cohortId', as: 'members' });
ClassCohortMember.belongsTo(ClassCohort, { foreignKey: 'cohortId', as: 'cohort' });
ClassCohortMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });

ClassOffer.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
ClassOffer.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });
ClassOffer.belongsTo(User, { foreignKey: 'buyerId', as: 'buyer' });
ClassOffer.belongsTo(ClassCohort, { foreignKey: 'cohortId', as: 'cohort' });
ClassOffer.belongsTo(ClassPackageTemplateVersion, { foreignKey: 'templateVersionId', as: 'templateVersion' });
ClassOffer.belongsTo(ClassPolicyVersion, { foreignKey: 'policyVersionId', as: 'policy' });
ClassOffer.belongsTo(ClassOffer, { foreignKey: 'replacesOfferId', as: 'replacesOffer' });
ClassOffer.hasMany(ClassOfferBeneficiary, { foreignKey: 'offerId', as: 'beneficiaries' });
ClassOfferBeneficiary.belongsTo(ClassOffer, { foreignKey: 'offerId', as: 'offer' });
ClassOfferBeneficiary.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Message.belongsTo(ClassOffer, { foreignKey: 'offerId', as: 'offer' });

ClassOffer.hasMany(ClassPackageOrder, { foreignKey: 'offerId', as: 'orders' });
ClassPackageOrder.belongsTo(ClassOffer, { foreignKey: 'offerId', as: 'offer' });
ClassPackageOrder.belongsTo(User, { foreignKey: 'buyerId', as: 'buyer' });
ClassPackageOrder.hasMany(PaymentProviderEvent, { foreignKey: 'orderId', as: 'events' });
PaymentProviderEvent.belongsTo(ClassPackageOrder, { foreignKey: 'orderId', as: 'order' });

ClassPackageOrder.hasOne(ClassPackagePurchase, { foreignKey: 'orderId', as: 'purchase' });
ClassPackagePurchase.belongsTo(ClassPackageOrder, { foreignKey: 'orderId', as: 'order' });
ClassPackagePurchase.belongsTo(ClassOffer, { foreignKey: 'offerId', as: 'offer' });
ClassPackagePurchase.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });
ClassPackagePurchase.belongsTo(User, { foreignKey: 'buyerId', as: 'buyer' });
ClassPackageProviderVerification.belongsTo(User, { foreignKey: 'verifiedById', as: 'verifiedBy' });
ClassPackageProviderVerification.belongsTo(User, { foreignKey: 'revokedById', as: 'revokedBy' });
ClassPackagePurchase.hasMany(ClassPackageBeneficiary, { foreignKey: 'purchaseId', as: 'beneficiaries' });
ClassPackageBeneficiary.belongsTo(ClassPackagePurchase, { foreignKey: 'purchaseId', as: 'purchase' });
ClassPackageBeneficiary.belongsTo(User, { foreignKey: 'userId', as: 'user' });
ClassPackagePurchase.hasMany(ClassCreditLedger, { foreignKey: 'purchaseId', as: 'ledger' });
ClassCreditLedger.belongsTo(ClassPackagePurchase, { foreignKey: 'purchaseId', as: 'purchase' });

ClassSession.belongsTo(User, { foreignKey: 'teacherId', as: 'teacher' });
ClassSession.belongsTo(ClassCohort, { foreignKey: 'cohortId', as: 'cohort' });
ClassSession.belongsTo(LiveClass, { foreignKey: 'liveClassId', as: 'liveClass' });
ClassSession.hasMany(ClassSessionProposal, { foreignKey: 'sessionId', as: 'proposals' });
ClassSessionProposal.belongsTo(ClassSession, { foreignKey: 'sessionId', as: 'session' });
ClassSession.hasMany(ClassSessionParticipant, { foreignKey: 'sessionId', as: 'participants' });
ClassSessionParticipant.belongsTo(ClassSession, { foreignKey: 'sessionId', as: 'session' });
ClassSessionParticipant.belongsTo(User, { foreignKey: 'userId', as: 'user' });
ClassSessionParticipant.belongsTo(ClassPackagePurchase, { foreignKey: 'purchaseId', as: 'purchase' });
Message.belongsTo(ClassSession, { foreignKey: 'classSessionId', as: 'classSession' });

User.hasMany(ExternalConnection, { foreignKey: 'userId', as: 'externalConnections' });
ExternalConnection.belongsTo(User, { foreignKey: 'userId', as: 'user' });
ClassSession.hasMany(ExternalSyncRef, { foreignKey: 'sessionId', as: 'syncRefs' });
ExternalSyncRef.belongsTo(ClassSession, { foreignKey: 'sessionId', as: 'session' });
ExternalSyncRef.belongsTo(ExternalConnection, { foreignKey: 'connectionId', as: 'connection' });
ExternalConnection.hasMany(ExternalCalendarChannel, { foreignKey: 'connectionId', as: 'calendarChannels' });

LegalAcceptance.belongsTo(User, { foreignKey: 'userId', as: 'user' });
AuditLog.belongsTo(User, { foreignKey: 'actorId', as: 'actor' });

module.exports = {
  LiveClass,
  LiveClassMember,
  GoogleConnection,
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
  Coupon,
  Affiliate,
  AffiliatePayout,
  LessonComment,
  TeacherClassSettings,
  Conversation,
  ConversationParticipant,
  Message,
  RateLimitBucket,
  ClassPolicyVersion,
  ClassPackageTemplate,
  ClassPackageTemplateVersion,
  ClassCohort,
  ClassCohortMember,
  ClassOffer,
  ClassOfferBeneficiary,
  ClassPackageOrder,
  PaymentProviderEvent,
  ClassPackagePurchase,
  ClassPackageBeneficiary,
  ClassCreditLedger,
  ClassSession,
  ClassSessionProposal,
  ClassSessionParticipant,
  ExternalConnection,
  ExternalSyncRef,
  ExternalCalendarChannel,
  OutboxJob,
  LegalAcceptance,
  LegalDocument,
  CourseExpectations,
  CourseCheckoutSnapshot,
  ClassPackageProviderVerification,
  AuditLog
};
