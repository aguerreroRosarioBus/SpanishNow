import {TestBed} from '@angular/core/testing';
import {signal} from '@angular/core';
import {ActivatedRoute, provideRouter} from '@angular/router';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting} from '@angular/common/http/testing';
import {of, throwError} from 'rxjs';
import {vi} from 'vitest';
import {TeacherDashboardComponent} from './dashboard/teacher-dashboard.component';
import {UnitListComponent} from './course-manage/components/unit-list.component';
import {StudentsPanelComponent} from './course-manage/components/students-panel.component';
import {CourseManageStore} from './course-manage/course-manage.store';
import {CourseContentStore} from './course-manage/course-content.store';
import {LiveRoomComponent} from '../live-classes/live-room.component';
import {LiveClassService} from '../../core/services/live-class.service';
import {AuthService} from '../../core/services/auth.service';
import {CourseService} from '../../core/services/course.service';
import {CourseStudentsService} from '../../core/services/course-students.service';
import {UserPreferencesService} from '../../core/services/user-preferences.service';
import {I18nService} from '../../core/i18n/i18n.service';
import {Course, Unit} from '../../core/models/course.model';
import {CourseStudent} from '../../core/models/sales.model';
import {TEACHER_DASHBOARD_EN, TEACHER_DASHBOARD_ES} from '../../core/i18n/catalogs/teacher-dashboard';

const text = (f: {nativeElement: HTMLElement}) => f.nativeElement.textContent as string;

describe('panel docente, unidades, alumnos y sala en vivo: idioma', () => {
  it('el catálogo tiene las mismas claves en EN y ES', () => {
    expect(Object.keys(TEACHER_DASHBOARD_EN).sort()).toEqual(Object.keys(TEACHER_DASHBOARD_ES).sort());
  });

  it('dashboard: conserva modal abierto, borrador y error por código sin repetir peticiones al cambiar idioma', () => {
    const course = {id: 1, teacherId: 7, title: 'Curso original', description: 'Descripción docente', level: 'A1'} as Course;
    const api = {getCourses: vi.fn(() => of([course])), createCourse: vi.fn(() => throwError(() => ({status: 400, error: {error: 'texto libre', code: 'teacher_unavailable'}}))), updateCourse: vi.fn()};
    TestBed.configureTestingModule({providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      {provide: CourseService, useValue: api},
      {provide: AuthService, useValue: {currentUser: signal({id: 7}), isTeacher: () => true, logout: vi.fn()}}]});
    const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
    const f = TestBed.createComponent(TeacherDashboardComponent); f.detectChanges(); const c = f.componentInstance;
    expect(text(f)).toContain('Mis cursos'); expect(text(f)).toContain('1 curso'); expect(text(f)).toContain('Curso original');
    c.openCreateModal(); c.courseForm.patchValue({title: 'Mi borrador', description: 'Texto a medio escribir'});
    c.createCourse(); f.detectChanges();
    expect(text(f)).toContain('Nuevo curso'); expect(c.errorMessage()).toBe('Este docente no está disponible por el momento.');
    c.courseForm.controls['title'].setValue(''); c.courseForm.controls['title'].markAsTouched(); f.detectChanges();
    expect(text(f)).toContain('El título es requerido');
    c.courseForm.controls['title'].setValue('Mi borrador');
    i18n.setLocale('en'); f.detectChanges();
    expect(text(f)).toContain('My courses'); expect(text(f)).toContain('1 course'); expect(text(f)).toContain('Manage content');
    expect(text(f)).toContain('Course title *'); expect(text(f)).toContain('Create course');
    expect(c.errorMessage()).toBe('This teacher is currently unavailable.');
    expect(c.showCreateModal()).toBe(true); expect(c.courseForm.value.title).toBe('Mi borrador'); expect(c.courseForm.value.description).toBe('Texto a medio escribir');
    expect(api.getCourses).toHaveBeenCalledTimes(1); expect(api.createCourse).toHaveBeenCalledTimes(1);
  });

  it('unidades: fechas, plurales y acciones cambian de idioma; el contenido docente no se traduce', () => {
    const unit = {id: 3, courseId: 1, title: 'Unidad 1: En el mercado', order: 1, stories: [], releaseAfterDays: 3, releaseAt: '2027-03-01'} as Unit;
    const manage = {units: signal([unit]), isUnitExpanded: () => true, toggleUnit: vi.fn(), expandAllUnits: vi.fn(), collapseAllUnits: vi.fn()};
    const content = {unitMaterialCount: () => 2, storyMaterialCount: () => 0, quiz: () => ({isPublished: false})};
    TestBed.configureTestingModule({providers: [{provide: CourseManageStore, useValue: manage}, {provide: CourseContentStore, useValue: content}]});
    const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
    const f = TestBed.createComponent(UnitListComponent); f.detectChanges();
    expect(text(f)).toContain('Contenido del curso'); expect(text(f)).toContain('Unidad 1'); expect(text(f)).toContain('0 historias');
    expect(text(f)).toContain('Día 3 y desde 1 de mar de 2027'); expect(text(f)).toContain('Quiz borrador'); expect(text(f)).toContain('Agregar historia');
    i18n.setLocale('en'); f.detectChanges();
    expect(text(f)).toContain('Course content'); expect(text(f)).toContain('Unit 1'); expect(text(f)).toContain('0 stories');
    expect(text(f)).toContain('Day 3 and from Mar 1, 2027'); expect(text(f)).toContain('Quiz draft'); expect(text(f)).toContain('Add story');
    expect(text(f)).toContain('En el mercado');
    expect(f.nativeElement.querySelector('[aria-label="Collapse unit"]')).toBeTruthy();
  });

  it('alumnos: conserva formulario, diálogo de baja y error por código sin repetir peticiones', () => {
    const student = {enrollmentId: 4, user: {id: 9, name: 'Ana ficticia', email: 'ana@example.test'}, source: 'hotmart_import', enrolledAt: '2026-10-23T00:00:00.000Z', progress: {completedStories: 1, totalStories: 4}} as CourseStudent;
    const api = {list: vi.fn(() => of([student])), add: vi.fn(() => throwError(() => ({status: 400, error: {error: 'texto libre', code: 'forbidden'}}))), remove: vi.fn(), previewImport: vi.fn(), import: vi.fn()};
    TestBed.configureTestingModule({providers: [{provide: CourseManageStore, useValue: {courseId: signal(1)}}, {provide: CourseStudentsService, useValue: api}, {provide: UserPreferencesService, useValue: {preferences: () => ({timeZone: 'UTC'})}}]});
    const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
    const f = TestBed.createComponent(StudentsPanelComponent); f.detectChanges(); const c = f.componentInstance;
    expect(text(f)).toContain('Agregar alumno'); expect(text(f)).toContain('23 oct 2026'); expect(text(f)).toContain('Hotmart'); expect(text(f)).toContain('1 alumno');
    c.addForm.setValue({email: 'nuevo@example.test', name: 'Borrador'}); c.askRemove(student); f.detectChanges();
    expect(text(f)).toContain('¿Quitar el acceso de Ana ficticia (ana@example.test) a este curso?');
    i18n.setLocale('en'); f.detectChanges();
    expect(text(f)).toContain('Add student'); expect(text(f)).toContain('Oct 23, 2026'); expect(text(f)).toContain('1 student');
    expect(text(f)).toContain('Remove access for Ana ficticia (ana@example.test) to this course?');
    expect(c.addForm.value).toEqual({email: 'nuevo@example.test', name: 'Borrador'}); expect(c.studentToRemove()).toBe(student);
    expect(api.list).toHaveBeenCalledTimes(1); expect(api.remove).not.toHaveBeenCalled(); expect(api.add).not.toHaveBeenCalled();
  });

  it('alumnos: la fecha de inscripción usa la zona de las preferencias, no UTC', () => {
    const student = {enrollmentId: 4, user: {id: 9, name: 'Ana ficticia', email: 'ana@example.test'}, source: 'manual', enrolledAt: '2026-10-23T00:30:00.000Z', progress: {completedStories: 0, totalStories: 4}} as CourseStudent;
    const api = {list: vi.fn(() => of([student])), add: vi.fn(), remove: vi.fn(), previewImport: vi.fn(), import: vi.fn()};
    TestBed.configureTestingModule({providers: [{provide: CourseManageStore, useValue: {courseId: signal(1)}}, {provide: CourseStudentsService, useValue: api}, {provide: UserPreferencesService, useValue: {preferences: () => ({timeZone: 'America/Argentina/Cordoba'})}}]});
    const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
    const f = TestBed.createComponent(StudentsPanelComponent); f.detectChanges();
    expect(text(f)).toContain('22 oct 2026'); expect(text(f)).not.toContain('23 oct 2026');
    i18n.setLocale('en'); f.detectChanges();
    expect(text(f)).toContain('Oct 22, 2026');
  });

  it('sala en vivo: la confirmación abierta cambia de idioma sin perder el estado ni pedir la sala de nuevo', async () => {
    const snapshot = {id: 1, teacherId: 7, courseId: null, title: 'Mi clase', status: 'live', allowStudentEdit: true, revision: 0, updatedAt: '', createdAt: '', isOwner: true, participants: [],
      board: {pages: [{id: 'page_0001', title: 'Página 1', elements: [], background: 'plain'}], activePageId: 'page_0001'}};
    const api = {snapshot: vi.fn(() => of(snapshot)), presence: vi.fn(() => of(undefined)), googleStatus: vi.fn(() => of({configured: false, connected: false, email: null})), change: vi.fn(), settings: vi.fn(), restore: vi.fn()};
    TestBed.configureTestingModule({imports: [LiveRoomComponent], providers: [provideRouter([]),
      {provide: ActivatedRoute, useValue: {snapshot: {paramMap: new Map([['id', '1']])}}},
      {provide: AuthService, useValue: {currentUser: signal({id: 7, role: 'teacher'})}},
      {provide: LiveClassService, useValue: api}]});
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
    const f = TestBed.createComponent(LiveRoomComponent); const c = f.componentInstance;
    await c.refresh(); c.ask('end'); f.detectChanges();
    expect(text(f)).toContain('Se finalizará «Mi clase»'); expect(text(f)).toContain('Finalizar clase');
    const requests = api.snapshot.mock.calls.length;
    i18n.setLocale('en'); f.detectChanges();
    expect(text(f)).toContain('“Mi clase” will be ended.'); expect(text(f)).toContain('End class');
    expect(c.confirm()).toBe('end'); expect(api.snapshot).toHaveBeenCalledTimes(requests); expect(api.change).not.toHaveBeenCalled();
    c.confirm.set('discard'); f.detectChanges();
    expect(c.confirmationAction).toBe('Discard');
    i18n.setLocale('es'); expect(c.confirmationAction).toBe('Descartar');
  });
});
