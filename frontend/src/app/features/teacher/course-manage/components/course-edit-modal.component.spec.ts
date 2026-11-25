import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { CourseEditModalComponent } from './course-edit-modal.component';
import { CourseManageStore } from '../course-manage.store';
import { CourseService } from '../../../../core/services/course.service';
import { CouponService } from '../../../../core/services/coupon.service';
import { ToastService } from '../../../../core/services/toast.service';
import { HotmartService } from '../../../../core/services/hotmart.service';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { Course } from '../../../../core/models/course.model';

describe('CourseEditModalComponent cover changes', () => {
  const course = { id: 7, title: 'Mi curso', price: 2500, currency: 'usd', isPublished: true, imageUrl: 'https://cdn.example.com/old.png', units: [{ id: 1 }], enrollmentCount: 9 } as Course;
  let api: { getCourses: ReturnType<typeof vi.fn>; updateCourse: ReturnType<typeof vi.fn> };
  let store: { course: ReturnType<typeof signal<Course | null>>; courseId: ReturnType<typeof signal<number>>; close: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    api = { getCourses: vi.fn(() => of([])), updateCourse: vi.fn(() => of({ ...course, imageUrl: 'https://cdn.example.com/new.png' })) };
    store = { course: signal<Course | null>({ ...course }), courseId: signal(7), close: vi.fn() };
    TestBed.configureTestingModule({ providers: [
      { provide: CourseManageStore, useValue: store }, { provide: CourseService, useValue: api },
      { provide: CouponService, useValue: { list: () => of([]) } },
      { provide: ToastService, useValue: { success: vi.fn(), warning: vi.fn() } }
    ] });
    vi.stubGlobal('URL', class extends URL {
      static override createObjectURL = vi.fn(() => 'blob:preview');
      static override revokeObjectURL = vi.fn();
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  const editor = () => TestBed.runInInjectionContext(() => new CourseEditModalComponent());
  it('saves a selected image alongside sales fields and empty optional IDs in multipart', () => {
    const component = editor(); const image = new File(['png'], 'google.png', { type: 'image/png' });
    component.selectImage(image); component.save();
    const [id, body] = api.updateCourse.mock.calls[0]; expect(id).toBe(7); expect(body).toBeInstanceOf(FormData);
    expect(body.get('image')).toBe(image); expect(body.get('price')).toBe('2500'); expect(body.get('isPublished')).toBe('true');
    expect(body.get('nextCourseId')).toBe(''); expect(body.get('introVideoUrl')).toBe('');
    expect(store.course()?.units).toEqual(course.units); expect(store.course()?.enrollmentCount).toBe(9);
    component.ngOnDestroy(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
  it('discarding a new cover keeps the saved cover and sends a normal JSON update', () => {
    const component = editor(); component.selectImage(new File(['png'], 'google.png', { type: 'image/png' }));
    expect(component.coverPreview()).toBe('blob:preview'); component.selectImage(null);
    expect(component.coverPreview()).toBe(course.imageUrl); component.save();
    expect(api.updateCourse.mock.calls[0][1]).not.toBeInstanceOf(FormData);
    expect(api.updateCourse.mock.calls[0][1]).not.toHaveProperty('image');
  });
});

describe('Conexión propia de Hotmart en el editor de cursos', () => {
  const course = { id: 7, title: 'Mi curso', price: 2500, currency: 'usd', isPublished: true, units: [{ id: 1 }], enrollmentCount: 9 } as Course;
  const noConnection = { webhookUrl: null, pending: false, verifiedAt: null };
  const pending = { ...noConnection, webhookUrl: 'https://example.test/api/payments/hotmart/webhook/teachers/unique', pending: true };
  const verified = { ...pending, pending: false, verifiedAt: '2026-11-25T12:00:00Z' };
  let connection = vi.fn();
  let saveKey = vi.fn();
  let updateCourse = vi.fn();
  beforeEach(() => {
    connection = vi.fn(() => of(noConnection));
    saveKey = vi.fn(() => of(pending));
    updateCourse = vi.fn(() => of(course));
  });
  const render = (setup: object) => {
    TestBed.configureTestingModule({ providers: [
      { provide: CourseManageStore, useValue: { course: signal<Course | null>({ ...course }), courseId: signal(7), close: vi.fn() } },
      { provide: CourseService, useValue: { getCourses: () => of([]), updateCourse } },
      { provide: CouponService, useValue: { list: () => of([]) } },
      { provide: HotmartService, useValue: { setup: () => of(setup), connection, saveKey } },
      { provide: ToastService, useValue: { success: vi.fn(), warning: vi.fn() } }
    ] });
    TestBed.inject(I18nService).setLocale('es');
    const fixture = TestBed.createComponent(CourseEditModalComponent); fixture.detectChanges(); return fixture;
  };
  it('permite a un docente sin permisos globales guardar su clave, verificar el aviso y guardar el curso', () => {
    const f = render({ canManage: false, configured: true });
    const el = f.nativeElement as HTMLElement;
    const button = (label: string) => [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!;
    const key = el.querySelector<HTMLInputElement>('#teacher-hotmart-key')!;
    expect(key.type).toBe('password');
    expect(el.querySelector('#hotmartWebhook')).toBeNull();
    key.value = 'clave-ficticia-hotmart';
    key.dispatchEvent(new Event('input'));
    f.detectChanges();
    button('Guardar clave').click();
    f.detectChanges();
    expect(saveKey).toHaveBeenCalledWith('clave-ficticia-hotmart');
    expect(el.querySelector<HTMLInputElement>('#teacher-hotmart-url')?.value).toBe(pending.webhookUrl);
    expect(el.querySelector('#teacher-hotmart-key')).toBeNull();
    expect(el.textContent).toContain('Esperando la prueba de Hotmart');

    const form = f.componentInstance.form;
    form.patchValue({ hotmartCheckoutUrl: 'https://pay.hotmart.com/DEMO' });
    f.detectChanges();
    expect(el.textContent).toContain('Ingresá el ID del producto');
    form.patchValue({ hotmartProductId: 'PRODUCT-123' });
    expect(f.componentInstance.needsVerifiedHotmart()).toBe(true);
    connection.mockReturnValue(of(verified));
    button('Comprobar prueba').click();
    f.detectChanges();
    expect(el.textContent).toContain('Cuenta verificada');
    expect(f.componentInstance.needsVerifiedHotmart()).toBe(false);
    f.componentInstance.save();
    expect(updateCourse).toHaveBeenCalledWith(7, expect.objectContaining({
      hotmartOwnAccount: true, hotmartProductId: 'PRODUCT-123', hotmartCheckoutUrl: 'https://pay.hotmart.com/DEMO'
    }));
  });
  it('quien administra Hotmart ve la URL, el estado del token y los pasos', () => {
    const f = render({ canManage: true, configured: false, webhookUrl: 'https://example.test/api/payments/hotmart/webhook' });
    const el = f.nativeElement as HTMLElement;
    expect((el.querySelector('#hotmartWebhook') as HTMLInputElement).value).toBe('https://example.test/api/payments/hotmart/webhook');
    expect(el.textContent).toContain('Conexión compartida de SpanishNow');
    expect(el.querySelector('#teacher-hotmart-key')).toBeTruthy();
  });
});
