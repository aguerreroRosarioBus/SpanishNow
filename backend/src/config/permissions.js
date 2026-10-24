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
  },
  {
    key: 'legal.manage',
    label: 'Documentos legales',
    description: 'Crear borradores bilingües y publicar versiones legales con identidad y contacto completos.'
  },
  // Classes, chat and packages (docs/clases-chat-integraciones/CONTRATO.md §12). Teachers act on their own resources
  // by ownership once enabled; none of these is implied by the teacher role.
  {
    key: 'class_teachers.manage',
    label: 'Docentes de clases',
    description: 'Habilitar o deshabilitar docentes para recibir consultas por chat y vender paquetes de clases.'
  },
  {
    key: 'class_packages.manage_all',
    label: 'Catálogo de clases global',
    description: 'Ver y gestionar paquetes, vínculos con Hotmart y políticas comerciales de cualquier docente.'
  },
  {
    key: 'class_payments.review',
    label: 'Revisión de pagos de clases',
    description: 'Ver y resolver pagos de paquetes en revisión y solicitudes de reembolso.'
  },
  {
    key: 'class_credits.adjust',
    label: 'Ajustes de saldo de clases',
    description: 'Corregir saldo o vigencia de una compra de clases, siempre con motivo y registro de auditoría.'
  },
  {
    key: 'class_credits.adjust_any',
    label: 'Ajustes de saldo de cualquier docente',
    description: 'Corregir el saldo de compras de clases de cualquier docente. Sin este permiso, class_credits.adjust solo alcanza las compras del propio docente.'
  },
  {
    key: 'class_sessions.support',
    label: 'Soporte de clases',
    description: 'Ver el estado de Calendar y Zoom de las clases, reintentar sincronizaciones y reenviar invitaciones. No da el enlace de anfitrión.'
  },
  {
    key: 'class_provider.verify',
    label: 'Proveedor de cobro de clases',
    description: 'Marcar como verificada o revocar la cuenta de Hotmart que cobra los paquetes de clases. Habilita o bloquea las ventas reales.'
  },
  {
    key: 'chat.moderate',
    label: 'Moderación del chat',
    description: 'Ver solo los mensajes reportados y ocultarlos con motivo; cada lectura queda registrada. No da acceso general a conversaciones privadas.'
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
