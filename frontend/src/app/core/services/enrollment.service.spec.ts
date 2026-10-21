import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnrollmentService } from './enrollment.service';

describe('EnrollmentService (contrato LessonProgress)', () => {
  let service: EnrollmentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(EnrollmentService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('consulta el avance por historia', () => {
    service.getProgress(7).subscribe(rows => expect(rows[0].answers.correct).toBe(2));
    const req = http.expectOne(r => r.url.endsWith('/enrollments/7/progress'));
    expect(req.request.method).toBe('GET');
    req.flush([{ storyId: 1, answers: { total: 3, correct: 2, attempts: 4 } }]);
  });

  it('reinicia el progreso con DELETE y devuelve lo eliminado', () => {
    service.resetCourseProgress(7).subscribe(res => expect(res.deleted.answers).toBe(5));
    const req = http.expectOne(r => r.url.endsWith('/enrollments/7/reset-progress'));
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'ok', deleted: { progress: 2, answers: 5, reinforcements: 1 } });
  });
});
