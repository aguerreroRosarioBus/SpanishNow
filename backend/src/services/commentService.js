// Questions and answers under a lesson (story). One level: a comment and its replies.
// Who: the teacher of the course and the students enrolled in it (a student only while the unit is open: drip content).
// Text: plain text of 1-2000 characters. The API stores it sanitized and clients must show it as text, never as HTML.
const { Op, QueryTypes, ForeignKeyConstraintError } = require('sequelize');
const sequelize = require('../config/database');
const { LessonComment, Story, Unit, Course, User, Enrollment } = require('../models');
const { assertUnitOpen } = require('./unitAvailability');
const { sendMail } = require('./mailService');
const templates = require('./emailTemplates');

const MAX_BODY = 2000;
const PAGE_SIZE = 20;
const HOURLY_LIMIT = 10;
const HOUR_MS = 3600000;

class CommentError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

/** { status, body } the route sends for a CommentError. */
const failure = error => ({ error: error.message, ...(error.code ? { code: error.code } : {}) });

const validId = value => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;

/**
 * Plain text from what the user typed: HTML tags and comments removed, line breaks normalized to \n, control and invisible
 * direction-changing characters removed, at most one blank line in a row, trimmed. Returns { value } or { error } (1-2000 characters).
 */
function sanitizeBody(raw) {
  if (typeof raw !== 'string') return { error: 'body must be text' };
  const text = raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?[A-Za-z!?][^>]*>/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const length = Array.from(text).length;
  if (length < 1 || length > MAX_BODY) return { error: `body must have between 1 and ${MAX_BODY} characters` };
  return { value: text };
}

/** Story with its unit and course, or null. */
async function loadStory(storyId) {
  if (!validId(storyId)) return null;
  return Story.findByPk(storyId, { include: [{ model: Unit, as: 'unit', include: [{ model: Course, as: 'course' }] }] });
}

/**
 * Who `user` is for the lessons of `story`: { owner: true } for the teacher of the course, { owner: false, enrollment } for an
 * enrolled student. Throws CommentError 403 for anybody else, and ContentLockedError for a student while the unit is closed.
 */
async function accessFor(user, story) {
  const course = story.unit.course;
  if (user.role === 'teacher') {
    if (course.teacherId !== user.id) throw new CommentError(403, 'Not authorized');
    return { owner: true, enrollment: null };
  }
  const enrollment = user.role === 'student'
    ? await Enrollment.findOne({ where: { studentId: user.id, courseId: course.id } })
    : null;
  if (!enrollment) throw new CommentError(403, 'Not authorized');
  await assertUnitOpen(user, story.unit, { enrollment });
  return { owner: false, enrollment };
}

const authorInclude = [{ model: User, as: 'author', attributes: ['id', 'name'] }];

/** Comment as a client sees it. `viewer` is the user, `course` the course of the lesson. Replies are added by the caller. */
function present(comment, viewer, course) {
  const isOwner = viewer.role === 'teacher' && viewer.id === course.teacherId;
  return {
    id: comment.id,
    parentId: comment.parentId,
    body: comment.body,
    author: { id: comment.author.id, name: comment.author.name, isTeacher: comment.author.id === course.teacherId },
    createdAt: comment.createdAt,
    editedAt: comment.editedAt || null,
    hidden: comment.hidden,
    canEdit: comment.userId === viewer.id,
    canDelete: comment.userId === viewer.id || isOwner
  };
}

const visibleTo = (viewer, owner) => (owner ? {} : { [Op.or]: [{ hidden: false }, { userId: viewer.id }] });

/**
 * One page of the first-level comments of a story (newest first) with all their replies (oldest first).
 * Hidden comments: the teacher sees all; anybody else sees only their own, marked hidden. Returns { rows, total }.
 */
async function list(user, story, access, page) {
  const course = story.unit.course;
  const scope = visibleTo(user, access.owner);
  const { rows, count } = await LessonComment.findAndCountAll({
    where: { storyId: story.id, parentId: null, ...scope }, include: authorInclude,
    order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE
  });
  const replies = rows.length
    ? await LessonComment.findAll({ where: { parentId: { [Op.in]: rows.map(row => row.id) }, ...scope }, include: authorInclude, order: [['createdAt', 'ASC'], ['id', 'ASC']] })
    : [];
  return {
    rows: rows.map(row => ({
      ...present(row, user, course),
      replies: replies.filter(reply => reply.parentId === row.id).map(reply => present(reply, user, course))
    })),
    total: count,
    pageSize: PAGE_SIZE
  };
}

/** Number of comments per story, for the course payload: Map(storyId -> count). The teacher counts all, others the visible ones. */
async function countByStory(storyIds, { includeHidden }) {
  if (!storyIds.length) return new Map();
  const rows = await sequelize.query(
    `SELECT storyId, COUNT(*) AS total FROM lesson_comments WHERE storyId IN (:ids) ${includeHidden ? '' : 'AND hidden = 0'} GROUP BY storyId`,
    { replacements: { ids: storyIds }, type: QueryTypes.SELECT }
  );
  return new Map(rows.map(row => [row.storyId, Number(row.total)]));
}

/**
 * Creates a comment (or a reply with `parentId`). Throws CommentError: 400 invalid, 404 parent not found, 429 rate_limited.
 * The limit (10 per student per hour; the teacher of the course is exempt) is counted in the database under a lock on the user's row, so concurrent requests cannot exceed it.
 */
async function create(user, story, access, { body, parentId }) {
  const sanitized = sanitizeBody(body);
  if (sanitized.error) throw new CommentError(400, sanitized.error);

  let parent = null;
  if (parentId !== undefined && parentId !== null && parentId !== '') {
    if (!validId(parentId)) throw new CommentError(400, 'parentId is not valid');
    parent = await LessonComment.findOne({ where: { id: Number(parentId), storyId: story.id, ...visibleTo(user, access.owner) } });
    if (!parent) throw new CommentError(404, 'Comment not found');
    if (parent.parentId !== null) throw new CommentError(400, 'You can only reply to a first-level comment');
  }

  try {
    const comment = await sequelize.transaction(async transaction => {
      await User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE, attributes: ['id'] });
      // The teacher of the course is exempt: answering many questions in a row is their job. Only students are limited.
      if (!access.owner) {
        const recent = await LessonComment.count({ where: { userId: user.id, createdAt: { [Op.gt]: new Date(Date.now() - HOUR_MS) } }, transaction });
        if (recent >= HOURLY_LIMIT) throw new CommentError(429, `You can post up to ${HOURLY_LIMIT} comments per hour. Try again later.`, 'rate_limited');
      }
      return LessonComment.create({ storyId: story.id, userId: user.id, parentId: parent ? parent.id : null, body: sanitized.value }, { transaction });
    });
    return { comment, parent };
  } catch (error) {
    if (error instanceof ForeignKeyConstraintError) throw new CommentError(404, 'Comment not found'); // the parent was deleted meanwhile
    throw error;
  }
}

/** Loads a comment with its author, story, unit and course; null when it does not exist. */
async function loadComment(id) {
  if (!validId(id)) return null;
  return LessonComment.findByPk(id, {
    include: [...authorInclude, { model: Story, as: 'story', include: [{ model: Unit, as: 'unit', include: [{ model: Course, as: 'course' }] }] }]
  });
}

/** Deletes a comment; a first-level one takes its replies with it. */
async function remove(comment) {
  await sequelize.transaction(async transaction => {
    await LessonComment.destroy({ where: { parentId: comment.id }, transaction });
    await comment.destroy({ transaction });
  });
}

/**
 * Inbox of the teacher: first-level comments of their courses, newest first. status 'unanswered': written by somebody other than the
 * teacher, not hidden and without a reply of the teacher. Returns { rows, total }.
 */
async function inbox(teacherId, { status, courseId, page }) {
  const replacements = { teacherId, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
  let where = 'c.parentId IS NULL AND co.teacherId = :teacherId';
  if (courseId) { where += ' AND co.id = :courseId'; replacements.courseId = courseId; }
  if (status === 'unanswered') {
    where += ' AND c.userId <> co.teacherId AND c.hidden = 0 AND NOT EXISTS (SELECT 1 FROM lesson_comments r WHERE r.parentId = c.id AND r.userId = co.teacherId)';
  }
  const from = `FROM lesson_comments c JOIN users u ON u.id = c.userId JOIN stories s ON s.id = c.storyId
    JOIN units un ON un.id = s.unitId JOIN courses co ON co.id = un.courseId WHERE ${where}`;
  const [rows, [{ total }]] = await Promise.all([
    sequelize.query(
      `SELECT c.id, c.body, c.createdAt, c.hidden, u.id AS authorId, u.name AS authorName, (u.id = co.teacherId) AS authorIsTeacher,
         s.id AS storyId, s.title AS storyTitle, un.id AS unitId, un.title AS unitTitle, co.id AS courseId, co.title AS courseTitle,
         (SELECT COUNT(*) FROM lesson_comments r WHERE r.parentId = c.id) AS replies,
         EXISTS (SELECT 1 FROM lesson_comments r WHERE r.parentId = c.id AND r.userId = co.teacherId) AS answeredByTeacher
       ${from} ORDER BY c.createdAt DESC, c.id DESC LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }),
    sequelize.query(`SELECT COUNT(*) AS total ${from}`, { replacements, type: QueryTypes.SELECT })
  ]);
  return {
    rows: rows.map(row => ({
      id: row.id,
      body: row.body,
      author: { id: row.authorId, name: row.authorName, isTeacher: Boolean(Number(row.authorIsTeacher)) },
      createdAt: row.createdAt,
      hidden: Boolean(Number(row.hidden)),
      story: { id: row.storyId, title: row.storyTitle },
      course: { id: row.courseId, title: row.courseTitle },
      unit: { id: row.unitId, title: row.unitTitle },
      replies: Number(row.replies),
      answeredByTeacher: Boolean(Number(row.answeredByTeacher))
    })),
    total: Number(total),
    pageSize: PAGE_SIZE
  };
}

/**
 * Emails after a comment was saved. Called AFTER the response was sent: a failure is logged, never raised.
 *   - a first-level comment of a student: the teacher (Spanish)
 *   - a reply of the teacher: the author of the comment replied to, when it is a student (English)
 */
async function notify(comment, parent, author, story) {
  try {
    const course = story.unit.course;
    if (author.id === course.teacherId) {
      if (!parent || parent.userId === author.id) return;
      const student = await User.findByPk(parent.userId, { attributes: ['id', 'name', 'email'] });
      if (!student || !student.email) return;
      await sendMail({ to: student.email, ...templates.teacherReplied({ studentName: student.name, teacherName: author.name, course, story, body: comment.body }) });
    } else if (!parent) {
      const teacher = await User.findByPk(course.teacherId, { attributes: ['id', 'name', 'email'] });
      if (!teacher || !teacher.email) return;
      await sendMail({ to: teacher.email, ...templates.newQuestion({ teacherName: teacher.name, authorName: author.name, course, story, body: comment.body }) });
    }
  } catch (error) {
    console.error(`Comment ${comment.id} notification failed:`, error.message);
  }
}

module.exports = {
  MAX_BODY, PAGE_SIZE, HOURLY_LIMIT, CommentError, failure, validId, sanitizeBody, loadStory, accessFor, present, list, countByStory,
  create, loadComment, remove, inbox, notify
};
