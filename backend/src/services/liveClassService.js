const { Op } = require('sequelize');
const { randomBytes } = require('node:crypto');
const sequelize = require('../config/database');
const { LiveClass, LiveClassMember, Course, Enrollment, User } = require('../models');
const { fail, text, blankBoard, applyOperations } = require('./liveBoard');
const google = require('./liveGoogleService');
const numericId = value => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647;
const summaryAttributes = ['id', 'teacherId', 'courseId', 'title', 'status', 'allowStudentEdit', 'revision', 'classroomCourseName', 'updatedAt', 'createdAt'];

async function access(user, live, ownerOnly = false) {
  if (!live) fail('Clase no encontrada.', 404);
  const owner = live.teacherId === user.id && user.role === 'teacher';
  if (owner) return true;
  if (ownerOnly || user.role !== 'student' || live.status === 'draft') fail('No tienes acceso a esta clase.', 403);
  if (live.courseId) {
    if (!await Enrollment.findOne({ where: { courseId: live.courseId, studentId: user.id } })) fail('Necesitas estar inscrito en el curso para entrar.', 403);
  } else if (!await LiveClassMember.findOne({ where: { liveClassId: live.id, userId: user.id } })) fail('Ingresa con el enlace o código de invitación.', 403);
  return false;
}
async function load(user, id, ownerOnly = false) {
  if (!numericId(id)) fail('Clase no encontrada.', 404);
  const live = await LiveClass.findByPk(Number(id));
  await access(user, live, ownerOnly);
  return live;
}
async function locked(user, id, ownerOnly, fn) {
  if (!numericId(id)) fail('Clase no encontrada.', 404);
  return sequelize.transaction(async transaction => {
    const live = await LiveClass.findByPk(Number(id), { transaction, lock: transaction.LOCK.UPDATE });
    const owner = await access(user, live, ownerOnly);
    return fn(live, owner, transaction);
  });
}
const present = (live, user) => ({
  id: live.id, teacherId: live.teacherId, courseId: live.courseId, title: live.title, status: live.status,
  allowStudentEdit: live.allowStudentEdit, revision: live.revision, updatedAt: live.updatedAt, createdAt: live.createdAt,
  isOwner: user.role === 'teacher' && live.teacherId === user.id,
  classroomCourseName: live.classroomCourseName || null,
  ...(user.role === 'teacher' && live.teacherId === user.id ? {
    joinCode: live.joinCode, classroomCourseId: live.classroomCourseId || null,
    classroomAnnouncementUrl: live.classroomAnnouncementUrl || null, classroomAnnouncementId: live.classroomAnnouncementId || null,
    driveFileUrl: live.driveFileUrl || null
  } : {})
});
async function list(user) {
  let where = { teacherId: user.id };
  if (user.role !== 'teacher') {
    const [enrollments, memberships] = await Promise.all([
      Enrollment.findAll({ where: { studentId: user.id }, attributes: ['courseId'] }),
      LiveClassMember.findAll({ where: { userId: user.id }, attributes: ['liveClassId'] })
    ]);
    where = { status: { [Op.ne]: 'draft' }, [Op.or]: [
      { courseId: { [Op.in]: enrollments.map(e => e.courseId) } },
      { courseId: null, id: { [Op.in]: memberships.map(m => m.liveClassId) } }
    ] };
  }
  const classes = await LiveClass.findAll({ where, attributes: summaryAttributes, order: [['updatedAt', 'DESC']], limit: 100 });
  return classes.map(c => present(c, user));
}
async function create(user, body) {
  let courseId = null;
  if (body.courseId !== undefined && body.courseId !== null && body.courseId !== '') {
    if (!numericId(body.courseId)) fail('Curso inválido.');
    const course = await Course.findByPk(Number(body.courseId));
    if (!course || course.teacherId !== user.id) fail('El curso no te pertenece.', 403);
    courseId = course.id;
  }
  const live = await LiveClass.create({ title: text(body.title, 200, 'Título'), teacherId: user.id, courseId,
    status: 'draft', joinCode: randomBytes(12).toString('base64url'), allowStudentEdit: true, board: blankBoard(), revision: 0, recentOperations: [] });
  return { ...present(live, user), board: live.board };
}
async function join(user, code) {
  if (user.role !== 'student') fail('El enlace de invitación es para alumnos.', 403);
  if (typeof code !== 'string' || !/^[\w-]{16}$/.test(code)) fail('Código de invitación inválido.', 404);
  const live = await LiveClass.findOne({ where: { joinCode: code } });
  if (!live || live.status === 'draft') fail('La clase no está en vivo. Pide al docente que la inicie.', 409);
  if (live.courseId && !await Enrollment.findOne({ where: { courseId: live.courseId, studentId: user.id } })) fail('Necesitas estar inscrito en el curso para entrar.', 403);
  if (live.status === 'ended') {
    if (!live.courseId && !await LiveClassMember.findOne({ where: { liveClassId: live.id, userId: user.id } })) fail('La clase ya finalizó. Solo pueden consultarla quienes participaron.', 409);
    return { id: live.id };
  }
  await LiveClassMember.upsert({ liveClassId: live.id, userId: user.id, lastSeenAt: new Date() });
  return { id: live.id };
}
async function snapshot(user, live, since) {
  const members = await LiveClassMember.findAll({ where: { liveClassId: live.id, lastSeenAt: { [Op.gt]: new Date(Date.now() - 45000) } },
    include: [{ model: User, as: 'user', attributes: ['id', 'name'] }], order: [['lastSeenAt', 'DESC']], limit: 50 });
  return { ...present(live, user), ...(String(live.revision) === String(since) ? { unchanged: true } : { board: live.board }),
    participants: members.filter(m => m.user).map(m => ({ id: m.user.id, name: m.user.name, isTeacher: m.user.id === live.teacherId })) };
}
async function heartbeat(user, live) {
  await LiveClassMember.upsert({ liveClassId: live.id, userId: user.id, lastSeenAt: new Date() });
}
const editable = (live, owner) => { if (!owner && (live.status !== 'live' || !live.allowStudentEdit)) fail('El docente pausó la edición de los alumnos.', 403); };
async function change(user, id, operations) {
  return locked(user, id, false, async (live, owner, transaction) => {
    editable(live, owner);
    const next = applyOperations(live.board, live.recentOperations || [], operations, user, owner, live.revision);
    if (next.revision !== live.revision) await live.update(next, { transaction });
    return { revision: live.revision, board: live.board };
  });
}
async function settings(user, id, body) {
  return locked(user, id, true, async (live, owner, transaction) => {
    const patch = {};
    if (body.title !== undefined) patch.title = text(body.title, 200, 'Título');
    if (body.status !== undefined) {
      if (!['draft', 'live', 'ended'].includes(body.status) || (body.status === 'draft' && live.status !== 'draft')) fail('Estado de clase inválido.');
      patch.status = body.status;
    }
    if (body.allowStudentEdit !== undefined) {
      if (typeof body.allowStudentEdit !== 'boolean') fail('Permiso de edición inválido.');
      patch.allowStudentEdit = body.allowStudentEdit;
    }
    if (!Object.keys(patch).length) fail('No hay cambios.');
    await live.update({ ...patch, revision: live.revision + 1 }, { transaction });
    return present(live, user);
  });
}
async function linkClassroom(user, id, courseId) {
  await load(user, id, true);
  const course = await google.course(user.id, courseId);
  return locked(user, id, true, async (live, owner, transaction) => {
    if (live.classroomAnnouncementId && live.classroomCourseId !== course.id) fail('Esta clase ya se publicó en Classroom. Crea otra sala para otro grupo.', 409);
    await live.update({ classroomCourseId: course.id, classroomCourseName: course.name.slice(0, 200), revision: live.revision + 1 }, { transaction });
    return present(live, user);
  });
}
async function announce(user, id) {
  return locked(user, id, true, async (live, owner, transaction) => {
    if (live.status !== 'live') fail('Inicia la clase antes de publicarla en Classroom.', 409);
    if (!live.classroomAnnouncementId) {
      const result = await google.announce(user.id, live);
      await live.update({ classroomAnnouncementId: result.id, classroomAnnouncementUrl: result.alternateLink || null, revision: live.revision + 1 }, { transaction });
    }
    return present(live, user);
  });
}
async function saveDrive(user, id) {
  return locked(user, id, true, async (live, owner, transaction) => {
    const result = await google.saveDrive(user.id, live);
    await live.update({ driveFileId: result.id, driveFileUrl: result.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(result.id)}/view`, revision: live.revision + 1 }, { transaction });
    return present(live, user);
  });
}
async function restore(user, id, fileId, expectedRevision) {
  await load(user, id, true);
  const board = await google.loadDrive(user.id, fileId);
  return locked(user, id, true, async (live, owner, transaction) => {
    if (live.status === 'live') fail('Finaliza la clase antes de restaurar una pizarra.', 409);
    if (expectedRevision !== live.revision) fail('La pizarra cambió. Actualiza antes de restaurar.', 409);
    await live.update({ board, recentOperations: [], revision: live.revision + 1 }, { transaction });
    return { ...present(live, user), board: live.board };
  });
}
module.exports = { load, access, locked, present, list, create, join, snapshot, heartbeat, editable, change, settings, linkClassroom, announce, saveDrive, restore };
