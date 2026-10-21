import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CourseManageStore } from './course-manage.store';
import { UnitService } from '../../../core/services/unit.service';
import { StoryService } from '../../../core/services/story.service';
import { CourseService } from '../../../core/services/course.service';

describe('CourseManageStore', () => {
  let store: CourseManageStore;
  const unitApi = { updateUnit: vi.fn(() => of({})), deleteUnit: vi.fn(() => of(undefined)) };
  const unit = (id: number, order: number, stories: any[] = []) => ({ id, courseId: 1, title: `U${id}`, order, stories });

  beforeEach(() => {
    unitApi.updateUnit.mockClear();
    TestBed.configureTestingModule({
      providers: [
        CourseManageStore,
        { provide: UnitService, useValue: unitApi },
        { provide: StoryService, useValue: { updateStoryOrder: vi.fn(() => of({})), deleteStory: vi.fn(() => of(undefined)) } },
        { provide: CourseService, useValue: { getCourse: () => of({ id: 1, title: 'C', units: [unit(1, 0), unit(2, 1)] }) } },
      ],
    });
    store = TestBed.inject(CourseManageStore);
    store.load(1);
  });

  it('carga el curso y expande todas las unidades', () => {
    expect(store.units().map(u => u.id)).toEqual([1, 2]);
    expect(store.isUnitExpanded(2)).toBe(true);
  });

  it('reordena unidades y persiste el nuevo orden', () => {
    const [a, b] = store.units();
    store.moveUnit(a, b);
    expect(store.units().map(u => u.id)).toEqual([2, 1]);
    expect(store.units().map(u => u.order)).toEqual([0, 1]);
    expect(unitApi.updateUnit).toHaveBeenCalledWith(1, { order: 1 });
  });

  it('el backdrop aplica a los diálogos pero no al compositor', () => {
    expect(store.hasBackdrop()).toBe(false);
    store.open({ kind: 'unit-create' });
    expect(store.hasBackdrop()).toBe(true);
    store.open({ kind: 'composer', story: { id: 1 } as any, unit: unit(1, 0) as any });
    expect(store.hasBackdrop()).toBe(false);
  });

  it('borrar una unidad exige confirmación', () => {
    store.deleteUnit(1);
    expect(unitApi.deleteUnit).not.toHaveBeenCalled();
    store.acceptConfirm();
    expect(unitApi.deleteUnit).toHaveBeenCalledWith(1);
    expect(store.units().map(u => u.id)).toEqual([2]);
  });
});
