import { TranslationCatalog } from '../i18n.types';

const pairs: Record<string, [string, string]> = {
  zone: ['Time zone', 'Zona horaria'],
  accountActive: ['Active', 'Activa'],
  zoneSearch: ['Search a city or time zone', 'Buscá una ciudad o zona horaria'],
  zoneHelp: [
    'Search by city or IANA name. UTC offsets shown are for today.',
    'Buscá por ciudad o nombre IANA. Los desfases UTC corresponden a hoy.',
  ],
  zoneEmpty: ['No matching time zones.', 'No encontramos zonas horarias.'],
  zoneSelect: [
    'Choose a result to confirm your time zone.',
    'Elegí un resultado para confirmar tu zona horaria.',
  ],
  deviceZone: ['Use device time zone', 'Usar zona del dispositivo'],
  preferencesHelp: ['Make SpanishNow feel at home.', 'SpanishNow, a tu manera.'],
  languageHelp: [
    'Choose the language of the platform. Changes are saved automatically.',
    'Elegí el idioma de la plataforma. El cambio se guarda automáticamente.',
  ],
  zoneSaved: ['Confirmed time zone', 'Zona horaria confirmada'],
  zonePending: ['Confirm your time zone', 'Confirmá tu zona horaria'],
  dates: ['Date range', 'Período de clases'],
  datesHelp: [
    'UTC dates · the end date is not included.',
    'Fechas en UTC · la fecha final no está incluida.',
  ],
  from: ['From', 'Desde'],
  to: ['Until', 'Hasta'],
  clear: ['Clear filters', 'Limpiar filtros'],
  directory: ['User directory', 'Directorio de usuarios'],
  directoryHelp: [
    'Find an account and manage its access.',
    'Encontrá una cuenta y administrá sus accesos.',
  ],
  user: ['User', 'Usuario'],
  access: ['Access', 'Acceso'],
  activity: ['Activity', 'Actividad'],
  manage: ['Manage user', 'Administrar usuario'],
  manageHelp: [
    'Changes to roles and permissions are saved immediately.',
    'Los cambios de rol y permisos se guardan al instante.',
  ],
  permissionsHelp: [
    'Grant only the access this person needs.',
    'Otorgá solo los accesos que esta persona necesita.',
  ],
  noPermissions: ['No additional permissions', 'Sin permisos adicionales'],
  permissionCount: ['{count} additional permissions', '{count} permisos adicionales'],
  allPermissions: ['Full access', 'Acceso completo'],
  testTools: ['Test environment', 'Entorno de pruebas'],
  testToolsHelp: [
    'Create and manage fictitious accounts for testing.',
    'Creá y gestioná cuentas ficticias para probar la plataforma.',
  ],
  you: ['You', 'Vos'],
};
const enMessages: Record<string, string> = {};
const esMessages: Record<string, string> = {};
for (const [key, [en, es]] of Object.entries(pairs)) {
  enMessages[`visual.${key}`] = en;
  esMessages[`visual.${key}`] = es;
}

export const VISUAL_EN: TranslationCatalog = enMessages;
export const VISUAL_ES: TranslationCatalog = esMessages;
