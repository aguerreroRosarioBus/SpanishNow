// Small, versioned object operations: unrelated contributions merge; stale edits never replace an entire board.
const { randomUUID } = require('node:crypto');
class LiveError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const fail = (message, status = 400, code) => { throw new LiveError(status, message, code); };
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(id);
const text = (value, max, label = 'Texto') => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label}: entre 1 y ${max} caracteres.`);
  return value.trim();
};
const number = (value, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail('Coordenadas o tamaño inválidos.');
  return Math.round(value * 10) / 10;
};
const color = value => { if (typeof value !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value)) fail('Color inválido.'); return value; };
const blankBoard = () => {
  const id = randomUUID();
  return { pages: [{ id, title: 'Página 1', background: 'plain', elements: [] }], activePageId: id };
};
function safeUrl(value, driveOnly = false) {
  try {
    if (typeof value !== 'string') fail('Enlace inválido.');
    const url = new URL(value);
    const dev = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/uploads-dev/');
    if ((url.protocol !== 'https:' && !dev) || url.username || url.password || value.length > 1500) fail('Enlace inválido.');
    if (driveOnly && !['drive.google.com', 'docs.google.com'].includes(url.hostname)) fail('Usa un enlace de Google Drive.');
    return url.href;
  } catch { fail('Enlace inválido.'); }
}
function element(raw, userId, version) {
  if (!raw || !validId(raw.id) || !['pen', 'line', 'rect', 'ellipse', 'note', 'text', 'image', 'link'].includes(raw.type)) fail('Elemento inválido.');
  const e = {
    id: raw.id, type: raw.type, x: number(raw.x, 0, 1600), y: number(raw.y, 0, 900),
    w: number(raw.w, 1, 1600), h: number(raw.h, 1, 900), color: color(raw.color),
    width: number(raw.width, 1, 30), authorId: userId, version
  };
  if (e.x + e.w > 1601 || e.y + e.h > 901) fail('El elemento debe quedar dentro de la pizarra.');
  if (e.type === 'pen' || e.type === 'line') {
    if (!Array.isArray(raw.points) || raw.points.length < 1 || raw.points.length > (e.type === 'line' ? 2 : 1200)) fail('Trazo inválido (máximo 1200 puntos).');
    e.points = raw.points.map(p => ({ x: number(p?.x, 0, 1600), y: number(p?.y, 0, 900) }));
  }
  if (['note', 'text', 'link'].includes(e.type)) e.text = text(raw.text, 1000);
  if (['image', 'link'].includes(e.type)) e.url = safeUrl(raw.url, e.type === 'link');
  return e;
}
function applyOperations(current, recent, ops, user, owner, revision) {
  if (!Array.isArray(ops) || !ops.length || ops.length > 40) fail('Envía entre 1 y 40 cambios.');
  const board = structuredClone(current);
  const seen = [...recent]; let changed = false;
  for (const op of ops) {
    if (!op || !validId(op.id)) fail('Identificador de cambio inválido.');
    const key = `${user.id}:${op.id}`;
    if (seen.includes(key)) continue;
    if (op.type === 'put' || op.type === 'delete') {
      const page = board.pages.find(p => p.id === op.pageId);
      if (!page) fail('La página ya no existe. Actualiza la pizarra.', 409, 'live_item_gone');
      const id = op.type === 'put' ? op.element?.id : op.elementId;
      const index = page.elements.findIndex(e => e.id === id);
      const old = page.elements[index];
      if (old && !owner && old.authorId !== user.id) fail('Solo puedes modificar tus propios elementos.', 403, 'live_own_elements_only');
      if ((old?.version || 0) !== op.expectedVersion) fail('Otro participante cambió este elemento. Actualiza e intenta otra vez.', 409, 'live_element_conflict');
      if (op.type === 'delete') {
        if (!old) fail('El elemento ya no existe.', 409, 'live_item_gone');
        page.elements.splice(index, 1);
      } else {
        const next = element(op.element, old?.authorId || user.id, (old?.version || 0) + 1);
        if (old) page.elements[index] = next;
        else {
          if (board.pages.some(p => p.elements.some(e => e.id === next.id))) fail('Identificador de elemento repetido.', 409);
          if (page.elements.length >= 500) fail('Esta página alcanzó los 500 elementos. Crea otra página.', 400, 'live_page_full');
          page.elements.push(next);
        }
      }
    } else {
      if (!owner) fail('Solo el docente puede administrar páginas.', 403, 'live_teacher_only_pages');
      const page = board.pages.find(p => p.id === op.pageId);
      switch (op.type) {
        case 'page-add':
          if (!validId(op.pageId) || page || board.pages.length >= 20) fail('Puedes tener hasta 20 páginas con identificadores únicos.', 400, 'live_page_limit');
          board.pages.push({ id: op.pageId, title: text(op.title, 80, 'Título'), background: 'plain', elements: [] });
          board.activePageId = op.pageId;
          break;
        case 'page-active':
          if (!page) fail('La página ya no existe.', 409, 'live_item_gone');
          board.activePageId = page.id;
          break;
        case 'page-clear':
        case 'page-delete':
          if (!page || op.expectedRevision !== revision) fail('La pizarra cambió. Actualiza antes de borrar.', 409);
          if (op.type === 'page-clear') page.elements = [];
          else {
            if (board.pages.length === 1) fail('Conserva al menos una página.');
            board.pages = board.pages.filter(p => p.id !== page.id);
            if (board.activePageId === page.id) board.activePageId = board.pages[0].id;
          }
          break;
        case 'page-background':
          if (!page || !['plain', 'dots', 'grid', 'lines'].includes(op.background)) fail('Fondo inválido.');
          page.background = op.background;
          break;
        default: fail('Cambio desconocido.');
      }
    }
    changed = true; seen.push(key);
  }
  if (Buffer.byteLength(JSON.stringify(board)) > 1500000) fail('La pizarra alcanzó su tamaño máximo (1,5 MB).', 400, 'live_board_too_large');
  return { board, recentOperations: seen.slice(-1000), revision: revision + (changed ? 1 : 0) };
}
function restoreBoard(raw, userId) {
  if (!raw || raw.format !== 'spanishnow-live-board' || raw.version !== 1 || !Array.isArray(raw.board?.pages) || raw.board.pages.length < 1 || raw.board.pages.length > 20) fail('Archivo de pizarra inválido.');
  const ids = new Set();
  const pages = raw.board.pages.map(p => {
    if (!p || !validId(p.id) || ids.has(p.id) || !Array.isArray(p.elements) || p.elements.length > 500 || !['plain', 'dots', 'grid', 'lines'].includes(p.background)) fail('Página inválida.');
    ids.add(p.id);
    return { id: p.id, title: text(p.title, 80), background: p.background, elements: p.elements.map(e => {
      if (!e || !validId(e.id)) fail('Elemento inválido.');
      if (ids.has(e.id)) fail('Identificador repetido.');
      ids.add(e.id); return element(e, userId, 1);
    }) };
  });
  const board = { pages, activePageId: pages.some(p => p.id === raw.board.activePageId) ? raw.board.activePageId : pages[0].id };
  if (Buffer.byteLength(JSON.stringify(board)) > 1500000) fail('Archivo demasiado grande.', 400, 'live_board_too_large');
  return board;
}
module.exports = { LiveError, fail, text, validId, blankBoard, safeUrl, element, applyOperations, restoreBoard };
