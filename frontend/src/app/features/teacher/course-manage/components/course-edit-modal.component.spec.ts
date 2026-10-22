import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { CourseEditModalComponent } from './course-edit-modal.component';
import { CourseManageStore } from '../course-manage.store';
import { CourseService } from '../../../../core/services/course.service';
import { CouponService } from '../../../../core/services/coupon.service';
import { ToastService } from '../../../../core/services/toast.service';
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
