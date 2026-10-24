const { blankBoard, applyOperations, restoreBoard, element, safeUrl } = require('../src/services/liveBoard');
const teacher = { id: 7 }, student = { id: 8 };
const note = (id = 'element_0001') => ({ id, type: 'note', x: 100, y: 100, w: 280, h: 220, color: '#fff2a8', width: 4, text: 'Hola', authorId: 999, version: 999 });
let board;
beforeEach(() => { board = blankBoard(); });
const put = (e, expectedVersion = 0, id = 'operation_01') => ({ id, type: 'put', pageId: board.pages[0].id, element: e, expectedVersion });
const run = (ops, user = student, owner = false, revision = 0, recent = []) => applyOperations(board, recent, ops, user, owner, revision);
test('new boards have an independent blank page', () => {
  expect(board.pages).toHaveLength(1); expect(board.activePageId).toBe(board.pages[0].id); expect(blankBoard().activePageId).not.toBe(board.activePageId);
});
test('author and version are assigned on the server; unrelated simultaneous objects merge', () => {
  board = run([put(note())]).board;
  board = run([put(note('element_0002'), 0, 'operation_02')], teacher, true, 1).board;
  expect(board.pages[0].elements.map(e => e.authorId)).toEqual([8, 7]);
  expect(board.pages[0].elements.map(e => e.version)).toEqual([1, 1]);
});
test('retrying the same operation is idempotent and does not change the revision', () => {
  const ops = [put(note())], first = run(ops);
  board = first.board;
  const retry = run(ops, student, false, first.revision, first.recentOperations);
  expect(retry.revision).toBe(1); expect(retry.board.pages[0].elements).toHaveLength(1);
});
test('a student cannot alter or erase another participant contribution', () => {
  board = run([put(note())], teacher, true).board;
  expect(() => run([put(note(), 1)])).toThrow(/propios/);
  expect(() => run([{ id: 'operation_02', type: 'delete', pageId: board.activePageId, elementId: note().id, expectedVersion: 1 }])).toThrow(/propios/);
});
test('teacher edits preserve original authorship, and stale updates fail atomically', () => {
  board = run([put(note())]).board;
  board = run([put({ ...note(), text: 'Corregido' }, 1, 'operation_02')], teacher, true).board;
  expect(board.pages[0].elements[0]).toMatchObject({ authorId: 8, version: 2, text: 'Corregido' });
  const original = structuredClone(board);
  expect(() => run([put(note('element_0002')), put(note(), 1, 'operation_03')], teacher, true)).toThrow(/Otro participante/);
  expect(board).toEqual(original);
});
test('delete checks the expected version and preserves unrelated objects', () => {
  board = run([put(note()), put(note('element_0002'), 0, 'operation_02')]).board;
  board = run([{ id: 'operation_03', type: 'delete', pageId: board.activePageId, elementId: note().id, expectedVersion: 1 }]).board;
  expect(board.pages[0].elements.map(e => e.id)).toEqual(['element_0002']);
});
test.each(['page-add', 'page-delete', 'page-clear', 'page-active', 'page-background', 'page-format', 'page-rename', 'page-reorder'])('students cannot administer pages: %s', type => {
  expect(() => run([{ id: 'operation_01', type, pageId: board.activePageId }])).toThrow(/docente/);
});
test('pages follow the teacher, support backgrounds and keep at least one page', () => {
  const firstId = board.activePageId;
  board = run([{ id: 'operation_01', type: 'page-add', pageId: 'new_page_001', title: 'Actividad' }], teacher, true).board;
  expect(board.activePageId).toBe('new_page_001');
  board = run([{ id: 'operation_02', type: 'page-background', pageId: board.activePageId, background: 'grid' }], teacher, true).board;
  expect(board.pages[1].background).toBe('grid');
  board = run([{ id: 'operation_03', type: 'page-delete', pageId: board.activePageId, expectedRevision: 0 }], teacher, true).board;
  expect(board.activePageId).toBe(firstId);
  expect(() => run([{ id: 'operation_04', type: 'page-delete', pageId: firstId, expectedRevision: 0 }], teacher, true)).toThrow(/al menos/);
});
test('page formats are validated and restored for notebooks and portrait pages', () => {
  board = run([{ id: 'operation_01', type: 'page-format', pageId: board.activePageId, format: 'notebook' }], teacher, true).board;
  expect(board.pages[0].format).toBe('notebook');
  expect(() => run([{ id: 'operation_02', type: 'page-format', pageId: board.activePageId, format: 'panorama' }], teacher, true)).toThrow(/Formato/);
  const restored = restoreBoard({ format: 'spanishnow-live-board', version: 1, board }, 7);
  expect(restored.pages[0].format).toBe('notebook');
  const legacy = restoreBoard({ format: 'spanishnow-live-board', version: 1, board: { ...board, pages: [{ ...board.pages[0], format: undefined }] } }, 7);
  expect(legacy.pages[0].format).toBe('wide');
});
test('page names and order are validated, revision guarded and persisted', () => {
  const firstId = board.activePageId;
  board = run([{ id: 'operation_01', type: 'page-add', pageId: 'new_page_001', title: 'Actividad' }], teacher, true).board;
  board = run([{ id: 'operation_02', type: 'page-rename', pageId: firstId, title: 'Inicio', expectedRevision: 1 }], teacher, true, 1).board;
  expect(board.pages[0].title).toBe('Inicio');
  board = run([{ id: 'operation_03', type: 'page-reorder', pageId: firstId, index: 1, expectedRevision: 2 }], teacher, true, 2).board;
  expect(board.pages.map(page => page.id)).toEqual(['new_page_001', firstId]);
  expect(() => run([{ id: 'operation_04', type: 'page-reorder', pageId: firstId, index: 0, expectedRevision: 1 }], teacher, true, 3)).toThrow(/cambió/);
  expect(() => run([{ id: 'operation_05', type: 'page-rename', pageId: firstId, title: ' ', expectedRevision: 3 }], teacher, true, 3)).toThrow(/Título/);
  expect(() => run([{ id: 'operation_06', type: 'page-reorder', pageId: firstId, index: 2, expectedRevision: 3 }], teacher, true, 3)).toThrow(/cambió/);
});
test('clearing a stale page is rejected instead of erasing unseen remote changes', () => {
  expect(() => run([{ id: 'operation_01', type: 'page-clear', pageId: board.activePageId, expectedRevision: 0 }], teacher, true, 1)).toThrow(/cambió/);
});
test.each([
  { x: -801 }, { w: Infinity }, { y: NaN }, { x: 2400 }, { text: 'a'.repeat(1001) }, { color: 'url(https://bad)' }, { id: '<svg>' }, { type: 'html' }
])('rejects invalid elements %j', patch => { expect(() => element({ ...note(), ...patch }, 7, 1)).toThrow(); });
test('drawing and resources may sit outside the paper but remain within the workspace', () => {
  expect(element({ ...note(), x: -500, y: -300 }, 7, 1)).toMatchObject({ x: -500, y: -300 });
  expect(() => element({ ...note(), x: -801 }, 7, 1)).toThrow();
  expect(() => element({ ...note(), x: 2350, w: 100 }, 7, 1)).toThrow(/espacio/);
});
test('text elements preserve empty drafts and validate font, size and text color', () => {
  const styled = element({ ...note(), text: '', fontFamily: 'Georgia', fontSize: 36, textColor: '#2f6f9f' }, 7, 1);
  expect(styled).toMatchObject({ text: '', fontFamily: 'Georgia', fontSize: 36, textColor: '#2f6f9f' });
  expect(() => element({ ...note(), fontFamily: 'url(https://bad)' }, 7, 1)).toThrow(/Fuente/);
  expect(() => element({ ...note(), fontSize: 1000 }, 7, 1)).toThrow(/Tamaño de fuente/);
  expect(() => element({ ...note(), textColor: 'red' }, 7, 1)).toThrow(/Color/);
});
test('drawing is bounded by the workspace; line direction and pen points survive serialization', () => {
  const line = { ...note(), type: 'line', points: [{ x: 200, y: 100 }, { x: 100, y: 200 }] };
  expect(element(line, 7, 1).points).toEqual(line.points);
  expect(() => element({ ...line, type: 'pen', points: Array(1201).fill({ x: 0, y: 0 }) }, 7, 1)).toThrow(/Trazo/);
  expect(() => element({ ...line, points: [{ x: 2500, y: 0 }] }, 7, 1)).toThrow();
});
test.each(['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'https://user:password@a.com/x', 'http://example.com/image'])('rejects unsafe URLs: %s', url => expect(() => safeUrl(url)).toThrow());
test('resource cards accept only Google Drive and Docs HTTPS links', () => {
  expect(safeUrl('https://docs.google.com/document/d/test', true)).toContain('docs.google.com');
  expect(() => safeUrl('https://drive.google.com.evil.com/test', true)).toThrow();
});
test('restoring a Drive board validates and resets all authors and versions', () => {
  board = run([put(note())]).board;
  const restored = restoreBoard({ format: 'spanishnow-live-board', version: 1, board }, 7);
  expect(restored.pages[0].elements[0]).toMatchObject({ authorId: 7, version: 1 });
  expect(() => restoreBoard({ board }, 7)).toThrow();
  board.pages[0].elements.push(board.pages[0].elements[0]);
  expect(() => restoreBoard({ format: 'spanishnow-live-board', version: 1, board }, 7)).toThrow(/repetido/);
});
test('operation and board limits prevent oversized payloads', () => {
  expect(() => run([])).toThrow();
  expect(() => run(Array(41).fill(put(note())))).toThrow();
  board.pages[0].elements = Array.from({ length: 500 }, (_, i) => ({ ...note(`element_${i}`), authorId: 8, version: 1 }));
  expect(() => run([put(note())])).toThrow(/500/);
});
