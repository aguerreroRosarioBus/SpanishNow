// Admin capabilities on top of the role (users.permissions). Catalog and effective permissions.
const PERMISSIONS = Object.freeze([
  {
    key: 'users.manage',
    label: 'Gestionar usuarios y permisos',
    description: 'Ver el listado de usuarios, cambiar su rol, asignar o quitar permisos y suspender o reactivar cuentas.'
  },
  {
    key: 'test_users.manage',
    label: 'Usuarios de prueba',
    description: 'Crear cuentas de prueba, entrar como una cuenta de prueba y borrar cuentas de prueba con sus datos.'
  }
]);

const PERMISSION_KEYS = PERMISSIONS.map(permission => permission.key);

// Bootstrap administrators: ADMIN_EMAILS (comma separated, case-insensitive) always have every permission.
const adminEmails = () => new Set(
  (process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
);

// Test accounts never have permissions, so "sign in as" cannot escalate privileges.
const isFixedAdmin = user => Boolean(user) && !user.isTestAccount && adminEmails().has(String(user.email).toLowerCase());

/** Stored permissions plus all of them for fixed admins, in catalog order (unknown stored keys are ignored). */
function effectivePermissions(user) {
  if (!user || user.isTestAccount) return [];
  if (isFixedAdmin(user)) return [...PERMISSION_KEYS];
  const stored = Array.isArray(user.permissions) ? user.permissions : [];
  return PERMISSION_KEYS.filter(key => stored.includes(key));
}

const hasPermission = (user, key) => effectivePermissions(user).includes(key);

module.exports = { PERMISSIONS, PERMISSION_KEYS, isFixedAdmin, effectivePermissions, hasPermission };
