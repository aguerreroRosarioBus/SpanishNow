// Admin panel: user listing, roles, permissions, suspension, test accounts and their deletion.
const crypto = require('crypto');
const { Op, literal, fn } = require('sequelize');
const sequelize = require('../config/database');
const {
  User, Course, Enrollment, Order, Coupon, Affiliate, LessonComment, LiveClass, LiveClassMember,
  GoogleConnection, PasswordToken, Tooltip
} = require('../models');
const { PERMISSION_KEYS, isFixedAdmin, effectivePermissions, hasPermission } = require('../config/permissions');
const { signToken, serializeAuthUser } = require('./authUser');

const ROLES = ['teacher', 'student'];
const MAX_TEST_USERS = 10;
const IMPERSONATION_TTL = '2h';
const TEST_EMAIL_DOMAIN = 'spanishnow.test';

class AdminError extends Error {
  constructor(status, message) {
    super(message);
    this.statusCode = status;
  }
}
const fail = (status, message) => { throw new AdminError(status, message); };

const COUNTS = [
  [literal('(SELECT COUNT(*) FROM enrollments WHERE enrollments.studentId = `User`.`id`)'), 'enrollmentsCount'],
  [literal('(SELECT COUNT(*) FROM courses WHERE courses.teacherId = `User`.`id`)'), 'coursesCount']
];
const USER_ATTRIBUTES = ['id', 'name', 'email', 'role', 'permissions', 'isTestAccount', 'suspendedAt', 'createdAt', ...COUNTS];

const serializeAdminUser = user => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  permissions: effectivePermissions(user),
  fixedAdmin: isFixedAdmin(user),
  isTestAccount: Boolean(user.isTestAccount),
  suspendedAt: user.suspendedAt,
  createdAt: user.createdAt,
  enrollmentsCount: Number(user.get('enrollmentsCount')),
  coursesCount: Number(user.get('coursesCount'))
});

const loadAdminUser = async (id, options = {}) => {
  const user = await User.findByPk(id, { attributes: USER_ATTRIBUTES, ...options });
  return user || fail(404, 'Usuario no encontrado');
};

const likePattern = text => `%${text.replace(/[\\%_]/g, '\\$&')}%`;
const parseId = value => (/^\d+$/.test(String(value)) ? Number(value) : fail(400, 'Identificador no válido'));

/** Users matching the filters. Without users.manage the actor only sees test accounts. */
async function listUsers(actor, query = {}) {
  const where = {};
  const search = String(query.search ?? '').trim().slice(0, 100);
  if (search) where[Op.or] = [{ name: { [Op.like]: likePattern(search) } }, { email: { [Op.like]: likePattern(search) } }];
  if (query.role) {
    if (!ROLES.includes(query.role)) fail(400, 'Rol no válido');
    where.role = query.role;
  }
  if (query.kind) {
    if (!['real', 'test'].includes(query.kind)) fail(400, 'Tipo no válido');
    where.isTestAccount = query.kind === 'test';
  }
  if (query.status) {
    if (!['active', 'suspended'].includes(query.status)) fail(400, 'Estado no válido');
    where.suspendedAt = query.status === 'active' ? null : { [Op.ne]: null };
  }
  if (!hasPermission(actor, 'users.manage')) where.isTestAccount = true;

  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 25));
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const { rows, count } = await User.findAndCountAll({
    where,
    attributes: USER_ATTRIBUTES,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  return { users: rows.map(serializeAdminUser), total: count, page, pageSize };
}

/** Changes role, permissions and/or suspension. Returns the updated user. */
async function updateUser(actor, id, { role, permissions, suspended } = {}) {
  const target = await User.findByPk(id);
  if (!target) fail(404, 'Usuario no encontrado');
  const isSelf = target.id === actor.id;
  const changes = {};

  if (role !== undefined) {
    if (!ROLES.includes(role)) fail(400, 'Rol no válido');
    if (role !== target.role) {
      if (role === 'student' && await Course.count({ where: { teacherId: target.id } })) {
        fail(409, 'Este profesor tiene cursos: no se puede pasar a alumno.');
      }
      changes.role = role;
    }
  }

  if (permissions !== undefined) {
    if (!Array.isArray(permissions) || permissions.some(key => typeof key !== 'string')) fail(400, 'Los permisos deben ser una lista de claves');
    const unknown = permissions.filter(key => !PERMISSION_KEYS.includes(key));
    if (unknown.length) fail(400, `Permisos desconocidos: ${unknown.join(', ')}`);
    const wanted = PERMISSION_KEYS.filter(key => permissions.includes(key));
    if (target.isTestAccount && wanted.length) fail(400, 'Las cuentas de prueba no pueden tener permisos.');
    if (isFixedAdmin(target) && wanted.length < PERMISSION_KEYS.length) fail(409, 'Los permisos de este administrador están fijados por configuración.');
    if (isSelf && !wanted.includes('users.manage')) fail(409, 'No puedes quitarte el permiso de gestionar usuarios.');
    changes.permissions = wanted;
  }

  if (suspended !== undefined) {
    if (typeof suspended !== 'boolean') fail(400, 'El campo suspended debe ser verdadero o falso');
    if (suspended) {
      if (isSelf) fail(409, 'No puedes suspender tu propia cuenta.');
      if (isFixedAdmin(target)) fail(409, 'Este administrador está fijado por configuración: no se puede suspender.');
      if (!target.suspendedAt) changes.suspendedAt = new Date();
    } else if (target.suspendedAt) {
      changes.suspendedAt = null;
    }
  }

  if (Object.keys(changes).length) await target.update(changes);
  return serializeAdminUser(await loadAdminUser(id));
}

const randomString = (length, alphabet) => Array.from({ length }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
const readablePassword = () => [4, 4, 4].map(length => randomString(length, 'abcdefghjkmnpqrstuvwxyz23456789')).join('-');

/** Creates 1-10 test accounts (optionally students enrolled in a course). Returns [{ user, password }]. */
async function createTestUsers(actor, { role, name, courseId, count = 1 } = {}) {
  if (!ROLES.includes(role)) fail(400, 'Rol no válido');
  const amount = Number(count);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_TEST_USERS) fail(400, `La cantidad debe estar entre 1 y ${MAX_TEST_USERS}`);
  const cleanName = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  let course = null;
  if (courseId !== undefined && courseId !== null && courseId !== '') {
    if (role !== 'student') fail(400, 'Solo los alumnos se pueden inscribir en un curso.');
    course = await Course.findByPk(parseId(courseId));
    if (!course) fail(404, 'Curso no encontrado');
  }

  const created = await sequelize.transaction(async transaction => {
    const result = [];
    for (let i = 0; i < amount; i += 1) {
      const code = randomString(6, 'abcdefghijklmnopqrstuvwxyz0123456789');
      const password = readablePassword();
      const label = role === 'teacher' ? 'Profesor' : 'Alumno';
      const user = await User.create({
        name: cleanName ? (amount > 1 ? `${cleanName} ${i + 1}` : cleanName) : `Prueba ${label} ${code}`,
        email: `prueba-${role}-${code}@${TEST_EMAIL_DOMAIN}`,
        password,
        role,
        isTestAccount: true
      }, { transaction });
      if (course) await Enrollment.create({ studentId: user.id, courseId: course.id, source: 'manual' }, { transaction });
      result.push({ id: user.id, password });
    }
    return result;
  });

  const users = await Promise.all(created.map(({ id }) => loadAdminUser(id)));
  return users.map((user, i) => ({ user: serializeAdminUser(user), password: created[i].password }));
}

/** Session token for a test account, flagged as impersonated. */
async function impersonate(actor, id) {
  const target = await User.findByPk(id);
  if (!target) fail(404, 'Usuario no encontrado');
  if (!target.isTestAccount) fail(403, 'Solo puedes entrar como una cuenta de prueba.');
  if (target.suspendedAt) fail(409, 'La cuenta de prueba está suspendida.');
  const claims = { impersonatedBy: actor.id };
  return { user: serializeAuthUser(target, claims), token: signToken(target, { ...claims, expiresIn: IMPERSONATION_TTL }) };
}

const idsOf = rows => rows.map(row => row.id);

/**
 * Deletes test accounts and everything that hangs from them, in one transaction. Returns how many accounts were deleted.
 * Foreign keys (see the migrations): users and courses cascade to their content, enrollments cascade to progress, quiz
 * attempts and certificates, but orders restrict deleting courses and affiliates, so they go first. A test teacher whose
 * courses hold data of real users is never deleted (409): that data is not ours to remove.
 */
async function deleteTestUsers(userIds) {
  return sequelize.transaction(async transaction => {
    const users = await User.findAll({ where: { id: userIds, isTestAccount: true }, attributes: ['id', 'email'], transaction });
    if (!users.length) return 0;
    const T = idsOf(users);

    // Lock the courses so nobody enrolls while we check who is in them.
    const courses = await Course.findAll({ where: { teacherId: T }, attributes: ['id', 'teacherId'], transaction, lock: transaction.LOCK.UPDATE });
    const C = idsOf(courses);
    const affiliates = await Affiliate.findAll({ where: { teacherId: T }, attributes: ['id'], transaction });
    const A = idsOf(affiliates);
    const lives = await LiveClass.findAll({ where: { [Op.or]: [{ teacherId: T }, { courseId: C }] }, attributes: ['id'], transaction });
    const L = idsOf(lives);

    const orderScope = { [Op.or]: [{ userId: T }, { courseId: C }, { affiliateId: A }] };
    // Other test accounts on those courses go with them; anyone else is a real user.
    const notTest = { [Op.notIn]: literal('(SELECT id FROM users WHERE isTestAccount = 1)') };
    const realData = await Promise.all([
      C.length ? Enrollment.count({ where: { courseId: C, studentId: notTest }, transaction }) : 0,
      Order.count({ where: { [Op.and]: [orderScope, { [Op.or]: [{ userId: { [Op.is]: null } }, { userId: notTest }] }] }, transaction }),
      L.length ? LiveClassMember.count({ where: { liveClassId: L, userId: notTest }, transaction }) : 0,
      C.length ? Coupon.count({ where: { courseId: C, teacherId: notTest }, transaction }) : 0
    ]);
    if (realData.some(count => count > 0)) {
      const owners = users.filter(user => courses.some(course => course.teacherId === user.id)).map(user => user.email);
      fail(409, `No se borró nada: los cursos de ${owners.join(', ') || 'una cuenta de prueba'} tienen inscripciones, órdenes o clases con datos de usuarios reales.`);
    }

    // Paid orders counted a use of their coupon: give it back to coupons that survive.
    const redeemed = await Order.findAll({
      where: { [Op.and]: [orderScope, { couponId: { [Op.ne]: null }, paidAt: { [Op.ne]: null } }] },
      attributes: ['couponId', [fn('COUNT', literal('*')), 'uses']], group: ['couponId'], raw: true, transaction
    });
    for (const { couponId, uses } of redeemed) {
      await Coupon.update({ redemptions: literal(`GREATEST(redemptions - ${Number(uses)}, 0)`) }, { where: { id: couponId, teacherId: { [Op.notIn]: T } }, transaction });
    }
    await Order.destroy({ where: orderScope, transaction });
    await Enrollment.destroy({ where: { [Op.or]: [{ studentId: T }, { courseId: C }] }, transaction });
    await LessonComment.destroy({ where: { userId: T }, transaction });
    await LiveClassMember.destroy({ where: { userId: T }, transaction });
    await LiveClass.destroy({ where: { id: L }, transaction });
    await Coupon.destroy({ where: { teacherId: T }, transaction });
    await Affiliate.destroy({ where: { teacherId: T }, transaction });
    await Course.destroy({ where: { id: C }, transaction });
    await GoogleConnection.destroy({ where: { userId: T }, transaction });
    await PasswordToken.destroy({ where: { userId: T }, transaction });
    await Tooltip.destroy({ where: { createdBy: T }, transaction });
    return User.destroy({ where: { id: T, isTestAccount: true }, transaction });
  });
}

async function deleteTestUser(id) {
  const target = await User.findByPk(id, { attributes: ['id', 'isTestAccount'] });
  if (!target) fail(404, 'Usuario no encontrado');
  if (!target.isTestAccount) fail(403, 'Solo se pueden borrar cuentas de prueba.');
  return deleteTestUsers([target.id]);
}

async function deleteAllTestUsers() {
  const users = await User.findAll({ where: { isTestAccount: true }, attributes: ['id'] });
  return deleteTestUsers(idsOf(users));
}

module.exports = { AdminError, parseId, listUsers, updateUser, createTestUsers, impersonate, deleteTestUser, deleteAllTestUsers };
