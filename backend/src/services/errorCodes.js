// Stable snake_case `code` for errors whose text is free-form (live classes, lesson plans, materials, student import).
// The existing `error` text is kept; the client translates by `code` and falls back to the HTTP status.
const STATUS_CODES = {
  400: 'validation_failed', 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found', 409: 'version_conflict',
  413: 'file_too_large', 429: 'rate_limited', 502: 'provider_unavailable', 503: 'provider_unavailable'
};

const LIVE = [
  [/^La clase no está en vivo/, 'live_not_live'],
  [/^El docente pausó la edición/, 'live_editing_paused'],
  [/^Necesitas estar inscrito/, 'live_enrollment_required'],
  [/^Ingresa con el enlace/, 'live_invite_required'],
  [/^Código de invitación inválido/, 'live_invite_invalid'],
  [/^La clase ya finalizó/, 'live_ended'],
  [/^Finaliza la clase antes/, 'live_finish_first'],
  [/^Inicia la clase antes/, 'live_start_first'],
  [/^Esta clase ya se publicó en Classroom/, 'live_already_published'],
  [/^La pizarra cambió/, 'live_board_changed'],
  [/^Otro participante cambió/, 'live_element_conflict'],
  [/^Solo puedes modificar tus propios elementos/, 'live_own_elements_only'],
  [/^Solo el docente puede administrar páginas/, 'live_teacher_only_pages'],
  [/^La página ya no existe|^El elemento ya no existe/, 'live_item_gone'],
  [/^Esta página alcanzó los 500/, 'live_page_full'],
  [/^Puedes tener hasta 20 páginas/, 'live_page_limit'],
  [/^La pizarra alcanzó su tamaño máximo|^Archivo demasiado grande/, 'live_board_too_large'],
  [/Google.*(venció|Vuelve a conectar|Conecta tu cuenta)|^Vuelve a conectar|^Conecta tu cuenta|^La autorización venció/, 'integration_not_connected']
];

const LESSON_PLAN = [
  [/^Draft revision changed/, 'lesson_plan_revision_conflict'],
  [/^No draft to publish/, 'lesson_plan_no_draft'],
  [/^(Active|Later|At least one active|Exactly one active)/, 'lesson_plan_incomplete']
];

const MATERIAL = [
  [/^The file is not a PDF/, 'not_a_pdf'],
  [/^File storage is not configured/, 'provider_unavailable']
];

const IMPORT = [
  [/^The file is empty/, 'import_file_empty'],
  [/^The file is not a valid CSV/, 'import_file_invalid'],
  [/^No email column found/, 'import_email_column_missing'],
  [/^The file has more than/, 'import_too_many_rows'],
  [/^This email belongs to a teacher account/, 'import_email_is_teacher']
];

/** Stable code for a message in `table`, or the one for the HTTP status; undefined when there is none. */
function errorCode(table, message, status) {
  const text = String(message || '');
  for (const [pattern, code] of table) if (pattern.test(text)) return code;
  return STATUS_CODES[status];
}

/** JSON body `{ error, code }`. The code set at the origin wins; the text table and HTTP status are only a fallback. */
function errorBody(table, message, status, origin) {
  const code = origin || errorCode(table, message, status);
  return code ? { error: message, code } : { error: message };
}

/** Router middleware: any JSON error body with `error` text and no `code` gets the one for its message or HTTP status. */
const withErrorCodes = table => (req, res, next) => {
  const json = res.json.bind(res);
  res.json = body => {
    if (res.statusCode >= 400 && body && typeof body === 'object' && !Array.isArray(body) && typeof body.error === 'string' && body.code === undefined) {
      const code = errorCode(table, body.error, res.statusCode);
      if (code) body = { ...body, code };
    }
    return json(body);
  };
  next();
};

module.exports = { STATUS_CODES, LIVE, LESSON_PLAN, MATERIAL, IMPORT, errorCode, errorBody, withErrorCodes };
