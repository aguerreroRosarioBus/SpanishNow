import { TEACHER_MANAGE_EN, TEACHER_MANAGE_ES } from './teacher-manage';

describe('teacherManage.courseEdit.hotmartUrlHelp', () => {
  const key = 'teacherManage.courseEdit.hotmartUrlHelp';
  const read = (catalog: unknown) => (catalog as Record<string, string>)[key];

  it('dice dónde copiar el link y que se vincula por el ID del producto, en ambos idiomas', () => {
    for (const text of [read(TEACHER_MANAGE_EN), read(TEACHER_MANAGE_ES)]) {
      expect(text).toContain('pay.hotmart.com');
      expect(text.toLowerCase()).toMatch(/product id|id de ese mismo producto|id del producto/);
    }
  });

  it('no inventa rutas de menú de Hotmart', () => {
    for (const text of [read(TEACHER_MANAGE_EN), read(TEACHER_MANAGE_ES)]) expect(text).not.toMatch(/›|>|menu|menú/i);
  });
});
