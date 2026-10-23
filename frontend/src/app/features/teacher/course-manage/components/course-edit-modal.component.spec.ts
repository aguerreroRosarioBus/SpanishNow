import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { CourseEditModalComponent } from './course-edit-modal.component';
import { CourseManageStore } from '../course-manage.store';
import { CourseService } from '../../../../core/services/course.service';
import { CouponService } from '../../../../core/services/coupon.service';
import { ToastService } from '../../../../core/services/toast.service';
import { HotmartService } from '../../../../core/services/hotmart.service';
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

describe('Tanda B: el webhook de Hotmart solo lo ve quien lo administra', () => {
  const course = { id: 7, title: 'Mi curso', price: 2500, currency: 'usd', isPublished: true, units: [{ id: 1 }], enrollmentCount: 9 } as Course;
  const render = (setup: object) => {
    TestBed.configureTestingModule({ providers: [
      { provide: CourseManageStore, useValue: { course: signal<Course | null>({ ...course }), courseId: signal(7), close: vi.fn() } },
      { provide: CourseService, useValue: { getCourses: () => of([]), updateCourse: vi.fn() } },
      { provide: CouponService, useValue: { list: () => of([]) } },
      { provide: HotmartService, useValue: { setup: () => of(setup) } },
      { provide: ToastService, useValue: { success: vi.fn(), warning: vi.fn() } }
    ] });
    const fixture = TestBed.createComponent(CourseEditModalComponent); fixture.detectChanges(); return fixture;
  };
  it('docente común: sin URL del webhook, sin estado del token ni pasos de Hotmart; ve la nota y sigue cargando producto y link', () => {
    const f = render({ canManage: false, configured: true });
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('#hotmartWebhook')).toBeNull();
    expect(el.querySelector('[data-testid=webhook-admin-only]')).toBeTruthy();
    expect(el.querySelector('#hotmartProduct')).toBeTruthy(); expect(el.querySelector('#hotmartUrl')).toBeTruthy();
    expect(el.textContent).not.toContain('HOTMART_HOTTOK');
  });
  it('quien administra Hotmart ve la URL, el estado del token y los pasos', () => {
    const f = render({ canManage: true, configured: false, webhookUrl: 'https://example.test/api/payments/hotmart/webhook' });
    const el = f.nativeElement as HTMLElement;
    expect((el.querySelector('#hotmartWebhook') as HTMLInputElement).value).toBe('https://example.test/api/payments/hotmart/webhook');
    expect(el.querySelector('[data-testid=webhook-admin-only]')).toBeNull();
    expect(el.querySelectorAll('ol li')).toHaveLength(3);
  });
});
