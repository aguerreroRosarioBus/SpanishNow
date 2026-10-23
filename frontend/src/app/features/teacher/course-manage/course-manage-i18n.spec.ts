import {TestBed, ComponentFixture} from '@angular/core/testing';
import {ActivatedRoute, provideRouter} from '@angular/router';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting} from '@angular/common/http/testing';
import {of, throwError} from 'rxjs';
import {vi} from 'vitest';
import {CourseManageComponent} from './course-manage';
import {CourseManageStore} from './course-manage.store';
import {validateQuiz} from './quiz-editor.logic';
import {CourseService} from '../../../core/services/course.service';
import {UnitService} from '../../../core/services/unit.service';
import {StoryService} from '../../../core/services/story.service';
import {QuizService} from '../../../core/services/quiz.service';
import {MaterialService} from '../../../core/services/material.service';
import {HotmartService} from '../../../core/services/hotmart.service';
import {CouponService} from '../../../core/services/coupon.service';
import {I18nService} from '../../../core/i18n/i18n.service';
import {TEACHER_MANAGE_EN, TEACHER_MANAGE_ES} from '../../../core/i18n/catalogs/teacher-manage';
import {EN} from '../../../core/i18n/catalogs/en';
import {ES} from '../../../core/i18n/catalogs/es';
import {Course} from '../../../core/models/course.model';

const text = (f: ComponentFixture<unknown>) => (f.nativeElement as HTMLElement).textContent as string;
const course = {
  id: 5, teacherId: 7, title: 'Curso de prueba', description: 'Descripción', level: 'A1', price: 1000, currency: 'usd', enrollmentCount: 2,
  units: [{id: 1, courseId: 5, title: 'Unidad 1: Saludos', description: 'Saludar', order: 0, stories: [
    {id: 11, unitId: 1, title: 'Juan en el mercado', order: 0, questions: [{id: 1}], lessonStatus: 'published'}]}]
} as unknown as Course;

describe('gestión de cursos docentes: idioma', () => {
  const api = {
    course: {getCourse: vi.fn(() => of(course)), getCourses: vi.fn(() => of([])), updateCourse: vi.fn()},
    unit: {createUnit: vi.fn(), updateUnit: vi.fn(), deleteUnit: vi.fn(() => of(undefined))},
    quiz: {getForTeacher: vi.fn(), save: vi.fn(), remove: vi.fn()},
    material: {list: vi.fn(() => of([{id: 3, title: 'Guía.pdf', sizeBytes: 2048, unitId: 1}])), upload: vi.fn(), update: vi.fn(), remove: vi.fn(), download: vi.fn()}
  };
  let f: ComponentFixture<CourseManageComponent>; let i18n: I18nService; let store: CourseManageStore;

  beforeEach(() => {
    vi.clearAllMocks();
    api.quiz.getForTeacher.mockImplementation(() => throwError(() => ({status: 404})));
    TestBed.configureTestingModule({providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      {provide: ActivatedRoute, useValue: {snapshot: {paramMap: new Map([['id', '5']]), queryParamMap: new Map()}}},
      {provide: CourseService, useValue: api.course}, {provide: UnitService, useValue: api.unit}, {provide: StoryService, useValue: {}},
      {provide: QuizService, useValue: api.quiz}, {provide: MaterialService, useValue: api.material},
      {provide: HotmartService, useValue: {setup: () => of({webhookUrl: 'https://example.test/hook', configured: false})}},
      {provide: CouponService, useValue: {list: () => of([])}}]});
    i18n = TestBed.inject(I18nService); i18n.setLocale('es');
    f = TestBed.createComponent(CourseManageComponent); f.detectChanges();
    store = f.componentInstance.store;
  });

  it('el catálogo nuevo tiene las mismas claves en EN y ES, sin duplicados ni claves ajenas', () => {
    const en = Object.keys(TEACHER_MANAGE_EN); const es = Object.keys(TEACHER_MANAGE_ES);
    expect(en.length).toBeGreaterThan(300);
    expect(en.sort()).toEqual(es.sort());
    expect(new Set(en).size).toBe(en.length);
    expect(en.every(key => key.startsWith('teacherManage.'))).toBe(true);
    for (const key of en) {
      expect(Object.hasOwn(EN, key) && Object.hasOwn(ES, key)).toBe(true);
      expect(JSON.stringify(Object.getOwnPropertyDescriptor(TEACHER_MANAGE_EN, key)?.value)).not.toBe('""');
    }
  });

  it('pantalla: plurales, pestañas y resumen cambian de idioma; el contenido docente no se traduce', () => {
    expect(text(f)).toContain('1 unidad'); expect(text(f)).toContain('2 estudiantes inscritos'); expect(text(f)).toContain('Editar curso');
    expect(text(f)).toContain('Nueva unidad'); expect(text(f)).toContain('Alumnos'); expect(text(f)).toContain('Publicado');
    i18n.setLocale('en'); f.detectChanges();
    expect(text(f)).toContain('1 unit'); expect(text(f)).toContain('2 students enrolled'); expect(text(f)).toContain('Edit course');
    expect(text(f)).toContain('New unit'); expect(text(f)).toContain('Students'); expect(text(f)).toContain('Published');
    expect(text(f)).toContain('Curso de prueba'); expect(text(f)).toContain('Juan en el mercado');
    expect(api.course.getCourse).toHaveBeenCalledTimes(1);
  });

  it('formulario de unidad: conserva borrador, regla y estado abierto al cambiar de idioma', () => {
    store.open({kind: 'unit-create'}); f.detectChanges();
    expect(f.nativeElement.querySelector('#unitTitle')).toBeTruthy(); expect(text(f)).toContain('Crear unidad');
    const title = f.nativeElement.querySelector('#unitTitle') as HTMLInputElement;
    const days = f.nativeElement.querySelector('#unitReleaseDays') as HTMLInputElement;
    title.value = 'Mi borrador'; title.dispatchEvent(new Event('input'));
    days.value = '7'; days.dispatchEvent(new Event('input')); f.detectChanges();
    expect(text(f)).toContain('Se libera a los 7 días de la inscripción.');
    expect(title.placeholder).toBe('Ej: Saludos y Presentaciones');
    i18n.setLocale('en'); f.detectChanges();
    expect(text(f)).toContain('New unit'); expect(text(f)).toContain('It unlocks 7 days after enrollment.');
    expect(text(f)).toContain('Release N days after enrollment'); expect(text(f)).toContain('Create unit');
    expect(title.placeholder).toBe('E.g. Greetings and introductions');
    expect(store.modal()?.kind).toBe('unit-create');
    expect((f.nativeElement.querySelector('#unitTitle') as HTMLInputElement).value).toBe('Mi borrador');
    expect((f.nativeElement.querySelector('#unitReleaseDays') as HTMLInputElement).value).toBe('7');
    expect(api.unit.createUnit).not.toHaveBeenCalled();
  });

  it('quiz: validaciones y error del servidor por código se traducen al leer, sin repetir peticiones', () => {
    store.open({kind: 'quiz', unit: course.units![0]}); f.detectChanges();
    expect(text(f)).toContain('Quiz · Saludos'); expect(text(f)).toContain('Guardar quiz'); expect(text(f)).toContain('Pregunta 1');
    (f.nativeElement.querySelector('#quizName') as HTMLInputElement).value = 'Quiz'; (f.nativeElement.querySelector('#quizName') as HTMLInputElement).dispatchEvent(new Event('input'));
    const save = [...f.nativeElement.querySelectorAll('button')].find((b: HTMLElement) => b.textContent?.includes('Guardar quiz')) as HTMLButtonElement;
    save.click(); f.detectChanges();
    expect(text(f)).toContain('Revisa los campos marcados antes de guardar.'); expect(text(f)).toContain('Escribe el enunciado.');
    i18n.setLocale('en'); f.detectChanges();
    expect(text(f)).toContain('Review the highlighted fields before saving.'); expect(text(f)).toContain('Write the prompt.');
    expect(text(f)).toContain('Passing score (%)'); expect(text(f)).toContain('Add question');
    expect((f.nativeElement.querySelector('#quizName') as HTMLInputElement).value).toBe('Quiz');
    expect(store.modal()?.kind).toBe('quiz'); expect(api.quiz.getForTeacher.mock.calls.filter(c => c[0] === 1).length).toBeGreaterThanOrEqual(1);
    const loads = api.quiz.getForTeacher.mock.calls.length;
    i18n.setLocale('es'); f.detectChanges();
    expect(api.quiz.getForTeacher).toHaveBeenCalledTimes(loads); expect(api.quiz.save).not.toHaveBeenCalled();
    expect(validateQuiz({title: '', passingScore: 70, isPublished: false, questions: []}).general).toEqual(['teacherManage.quiz.err.title', 'teacherManage.quiz.err.minQuestions']);
  });

  it('materiales y confirmación: texto, destinos y diálogo abiertos siguen el idioma sin perder el estado', () => {
    store.open({kind: 'materials', unit: course.units![0]}); f.detectChanges();
    expect(text(f)).toContain('Materiales · Saludos'); expect(text(f)).toContain('Unidad: Saludos'); expect(text(f)).toContain('Subir PDF');
    expect(text(f)).toContain('2 KB');
    const title = f.nativeElement.querySelector('#materialTitle') as HTMLInputElement;
    title.value = 'Borrador PDF'; title.dispatchEvent(new Event('input'));
    store.deleteUnit(1); f.detectChanges();
    expect(text(f)).toContain('¿Eliminar la unidad «Unidad 1: Saludos»?');
    i18n.setLocale('en'); f.detectChanges();
    expect(text(f)).toContain('Materials · Saludos'); expect(text(f)).toContain('Unit: Saludos');
    expect(text(f)).toContain('Delete the unit “Unidad 1: Saludos”?'); expect(text(f)).toContain('Delete unit');
    expect(store.showConfirmDialog()).toBe(true); expect(store.modal()?.kind).toBe('materials');
    expect((f.nativeElement.querySelector('#materialTitle') as HTMLInputElement).value).toBe('Borrador PDF');
    expect(api.unit.deleteUnit).not.toHaveBeenCalled(); expect(api.material.list).toHaveBeenCalledTimes(1);
  });

  it('editar curso: etiquetas, moneda y error por código cambian de idioma sin perder el borrador', () => {
    api.course.updateCourse.mockReturnValue(throwError(() => ({status: 400, error: {error: 'texto libre', code: 'forbidden'}})));
    store.open({kind: 'course-edit'}); f.detectChanges();
    expect(text(f)).toContain('Editar curso'); expect(text(f)).toContain('Imagen de portada'); expect(text(f)).toContain('USD (dólar)');
    const title = f.nativeElement.querySelector('#courseTitle') as HTMLInputElement;
    title.value = 'Título nuevo'; title.dispatchEvent(new Event('input'));
    const form = f.nativeElement.querySelector('form.d-flex') as HTMLFormElement; form.dispatchEvent(new Event('submit')); f.detectChanges();
    expect(api.course.updateCourse).toHaveBeenCalledTimes(1);
    const es = (f.nativeElement.querySelector('.alert-danger') as HTMLElement).textContent;
    i18n.setLocale('en'); f.detectChanges();
    const en = (f.nativeElement.querySelector('.alert-danger') as HTMLElement).textContent;
    expect(en).not.toBe(es); expect(en).toBe(i18n.errorMessage({error: {code: 'forbidden'}}));
    expect(text(f)).toContain('Cover image'); expect(text(f)).toContain('USD (US dollar)'); expect(text(f)).toContain('Save changes');
    expect(text(f)).toContain('Sales text (in English)');
    expect((f.nativeElement.querySelector('#courseTitle') as HTMLInputElement).value).toBe('Título nuevo');
    expect(store.modal()?.kind).toBe('course-edit'); expect(api.course.updateCourse).toHaveBeenCalledTimes(1);
  });
});
