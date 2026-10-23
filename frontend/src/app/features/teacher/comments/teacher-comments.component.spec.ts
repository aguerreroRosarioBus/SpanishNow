import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {of} from 'rxjs';
import {vi} from 'vitest';
import {TeacherCommentsComponent} from './teacher-comments.component';
import {CommentService} from '../../../core/services/comment.service';
import {CommentBadgeService} from '../../../core/services/comment-badge.service';
import {CourseService} from '../../../core/services/course.service';
import {UserPreferencesService} from '../../../core/services/user-preferences.service';
import {I18nService} from '../../../core/i18n/i18n.service';
import {formatFileSize} from '../../../core/services/material.service';

it('docente: conserva respuesta, filtros, comentario humano y confirmación al alternar idioma', () => {
  const row = {id: 1, body: '<b>Texto humano original</b>', author: {id: 2, name: 'José original'}, course: {id: 1, title: 'Curso original'}, unit: {id: 1, title: 'Unidad original'}, story: {id: 1, title: 'Historia original'}, createdAt: '2026-10-23T02:30:00Z', replies: 2, answeredByTeacher: false};
  const api = {inbox: vi.fn(() => of({rows: [row], total: 1})), create: vi.fn(), remove: vi.fn()};
  TestBed.configureTestingModule({providers: [provideRouter([]), {provide: CommentService, useValue: api}, {provide: CommentBadgeService, useValue: {set: vi.fn()}}, {provide: CourseService, useValue: {getCourses: () => of([])}}, {provide: UserPreferencesService, useValue: {preferences: () => ({timeZone: 'America/Argentina/Cordoba'})}}]});
  const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
  const f = TestBed.createComponent(TeacherCommentsComponent); f.detectChanges(); const c = f.componentInstance;
  c.startReply(c.rows()[0]); c.replyDraft.set('Borrador humano'); c.courseId.set(1); c.askDelete(c.rows()[0]);
  i18n.setLocale('en'); f.detectChanges();
  expect(f.nativeElement.textContent).toContain('Delete José original’s comment?');
  expect(f.nativeElement.textContent).toContain('Oct 22, 2026');
  expect(f.nativeElement.textContent).toContain('<b>Texto humano original</b>');
  expect(f.nativeElement.querySelector('.item__body b')).toBeNull();
  expect(c.replyDraft()).toBe('Borrador humano'); expect(c.toDelete()).toBe(row); expect(c.courseId()).toBe(1);
  expect(api.inbox).toHaveBeenCalledTimes(1); expect(api.remove).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled();
});
it('tamaño de material cambia separador sin cambiar cantidad/unidad', () => {
  expect(formatFileSize(1.5 * 1024 * 1024, 'en-US')).toBe('1.5 MB');
  expect(formatFileSize(1.5 * 1024 * 1024, 'es-AR')).toBe('1,5 MB');
  expect(formatFileSize(340 * 1024, 'en-US')).toBe('340 KB');
});
