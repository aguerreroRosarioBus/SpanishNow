import { I18nService } from '../../../core/i18n/i18n.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { LessonCommentsComponent } from './lesson-comments.component';
import { CommentService } from '../../../core/services/comment.service';
import { ToastService } from '../../../core/services/toast.service';
import { LessonComment } from '../../../core/models/community.model';

const evil = '<img src=x onerror="window.__pwned=1"><b>hola</b>\nsegunda línea';
const comment = (over: Partial<LessonComment> = {}): LessonComment => ({
  id: 1, body: evil, author: { id: 5, name: 'Ana <i>Z</i>', isTeacher: false }, createdAt: '2026-10-21T10:00:00Z',
  editedAt: null, hidden: false, canEdit: true, canDelete: true,
  replies: [{ id: 2, body: 'Gracias', author: { id: 9, name: 'Sol', isTeacher: true }, createdAt: '2026-10-21T11:00:00Z', editedAt: null, hidden: false, canEdit: false, canDelete: false }],
  ...over
});

function setup(list: () => any) {
  TestBed.configureTestingModule({
    providers: [
      {provide: UserPreferencesService, useValue: {preferences: () => ({timeZone: 'America/Argentina/Cordoba'})}},
      { provide: CommentService, useValue: { list: list, create: () => of({}), update: () => of({}), remove: () => of(undefined) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } }
    ]
  });
  TestBed.inject(I18nService).setLocale('es');
  const fixture = TestBed.createComponent(LessonCommentsComponent);
  fixture.componentRef.setInput('storyId', 10);
  fixture.detectChanges();
  return fixture;
}

describe('LessonCommentsComponent', () => {
  it('muestra el texto de los comentarios como texto plano (nunca como HTML)', () => {
    const fixture = setup(() => of({ rows: [comment()], total: 1 }));
    const el: HTMLElement = fixture.nativeElement;
    const body = el.querySelector('.comment__body') as HTMLElement;
    expect(body.textContent).toBe(evil);
    expect(body.children.length).toBe(0);
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.comment__author')?.children.length).toBe(0);
    expect((window as any).__pwned).toBeUndefined();
  });

  it('marca la respuesta del docente', () => {
    const fixture = setup(() => of({ rows: [comment()], total: 1 }));
    expect((fixture.nativeElement as HTMLElement).querySelector('.badge-teacher')?.textContent).toContain('Profesor/a');
  });

  it('con 403 content_locked muestra «Disponible el …» y no un error genérico', () => {
    const fixture = setup(() => throwError(() => ({ status: 403, error: { code: 'content_locked', availableAt: '2026-11-03T12:00:00Z' } })));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Disponible el 3 de noviembre de 2026');
    expect(text).not.toContain('No se pudieron cargar');
  });

  it('con otro error ofrece reintentar', () => {
    const fixture = setup(() => throwError(() => ({ status: 500, error: {} })));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No se pudieron cargar los comentarios.');
  });
});


it('EN/ES conserva comentario/respuesta/edición y confirmación pendientes, sin requests ni traducción humana', () => {
  const list = vi.fn(() => of({rows: [comment()], total: 1}));
  const f = setup(list); const c = f.componentInstance; const item = c.comments()[0];
  c.draft.set('Borrador humano'); c.startReply(item); c.replyDraft.set('Respuesta humana');
  c.startEdit(item); c.editDraft.set('Edición humana'); c.askDelete(item); f.detectChanges();
  TestBed.inject(I18nService).setLocale('en'); f.detectChanges();
  expect(f.nativeElement.textContent).toContain('Questions and comments');
  expect(f.nativeElement.textContent).toContain('The comment and its replies will be deleted');
  expect(c.draft()).toBe('Borrador humano'); expect(c.replyDraft()).toBe('Respuesta humana'); expect(c.editDraft()).toBe('Edición humana');
  expect(c.toDelete()).toBe(item); expect(c.comments()[0]).toBe(item); expect(item.body).toBe(evil);
  expect(list).toHaveBeenCalledTimes(1);
});
it('error ya visible cambia de idioma sin repetir carga', () => {
  const list = vi.fn(() => throwError(() => ({error: {code: 'unknown', error: 'PRIVATE_INTERNAL'}})));
  const f = setup(list);
  TestBed.inject(I18nService).setLocale('en'); f.detectChanges();
  expect(f.nativeElement.textContent).toContain('Could not load comments.');
  expect(f.nativeElement.textContent).not.toContain('PRIVATE_INTERNAL'); expect(list).toHaveBeenCalledTimes(1);
});
