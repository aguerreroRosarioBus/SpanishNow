import { TranslationCatalog } from '../i18n.types';

/** W12 (auditoría, Lote 1): página 404, aviso de falta de permiso y «Escribir» a un docente. */
export const ACCESS_EN = {
  'notFound.code': 'Error 404',
  'notFound.title': 'We could not find that page',
  'notFound.help': 'The address may be misspelled or the page may have moved. Your session is still open.',
  'notFound.myCourses': 'My courses',
  'notFound.teacherPanel': 'Teacher dashboard',
  'notFound.catalog': 'Browse courses',
  'notFound.login': 'Sign in',
  'access.denied': 'Your account does not have this permission. Ask whoever manages the platform for it.',
  'teachers.write': 'Write',
  'teachers.writeLabel': 'Write to {name}',
  'teachers.writing': 'Opening…',
  'teachers.writeError': 'Could not open the conversation. Please try again.'
} as const satisfies TranslationCatalog;

export const ACCESS_ES = {
  'notFound.code': 'Error 404',
  'notFound.title': 'No encontramos esa página',
  'notFound.help': 'Puede que la dirección esté mal escrita o que la página se haya movido. Tu sesión sigue abierta.',
  'notFound.myCourses': 'Mis cursos',
  'notFound.teacherPanel': 'Panel docente',
  'notFound.catalog': 'Ver cursos',
  'notFound.login': 'Iniciar sesión',
  'access.denied': 'Tu cuenta no tiene este permiso. Pídelo a quien administra la plataforma.',
  'teachers.write': 'Escribir',
  'teachers.writeLabel': 'Escribir a {name}',
  'teachers.writing': 'Abriendo…',
  'teachers.writeError': 'No se pudo abrir la conversación. Inténtalo de nuevo.'
} as const satisfies Record<keyof typeof ACCESS_EN, string>;
