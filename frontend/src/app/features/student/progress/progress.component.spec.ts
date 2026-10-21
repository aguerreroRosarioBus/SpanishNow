import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ProgressComponent } from './progress.component';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { StoryProgress } from '../../../core/models/course.model';

const story = (storyId: number, extra: Partial<StoryProgress> = {}): StoryProgress => ({
  storyId, storyTitle: `Historia ${storyId}`, unitId: 1, unitTitle: 'Unidad 1', revision: 2, lastBlockKey: null,
  narrativeCompleted: false, completedAt: null,
  answers: { total: 3, correct: 2, attempts: 4 }, reinforcements: { total: 2, completed: 1 }, ...extra,
});

describe('ProgressComponent (avance por historia)', () => {
  async function create(getProgress: (id: number) => any) {
    await TestBed.configureTestingModule({
      imports: [ProgressComponent],
      providers: [
        provideRouter([]),
        { provide: EnrollmentService, useValue: {
          getMyCourses: () => of([
            { id: 1, studentId: 1, courseId: 10, createdAt: '', course: { title: 'Curso A', level: 'A1' } },
            { id: 2, studentId: 1, courseId: 20, createdAt: '', course: { title: 'Curso B', level: 'A2' } },
          ]),
          getProgress,
        } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ProgressComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('muestra por historia estado, respuestas y refuerzos; sin datos muestra «—» en vez de 0/0', async () => {
    const getProgress = vi.fn((id: number) => of(id === 1
      ? [story(100, { narrativeCompleted: true, completedAt: '2026-01-01' }), story(200, { revision: null, answers: { total: 0, correct: 0, attempts: 0 }, reinforcements: { total: 0, completed: 0 } })]
      : []));
    const fixture = await create(getProgress);
    expect(getProgress).toHaveBeenCalledWith(1);
    expect(getProgress).toHaveBeenCalledWith(2);
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Historia 100');
    expect(text).not.toContain('revisión');
    expect(text).not.toContain('0/0');
    expect(text).toContain('Lectura completada');
    expect(text).toContain('2/3 · 4 intentos');
    expect(text).toContain('1/2');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.dash').length).toBe(2);
    expect(text).toContain('1/2 · 50%');
  });

  it('un curso que falla no rompe los demás', async () => {
    const fixture = await create((id: number) => id === 1 ? throwError(() => new Error('x')) : of([story(300)]));
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('No se pudo cargar el avance de este curso.');
    expect(text).toContain('Historia 300');
  });
});
