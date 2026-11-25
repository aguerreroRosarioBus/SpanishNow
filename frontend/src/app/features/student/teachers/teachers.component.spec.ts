import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeachersComponent } from './teachers.component';
import { environment } from '../../../../environments/environment';

const session = (role: 'student' | 'teacher') => {
  localStorage.setItem('token', 'jwt-de-prueba');
  localStorage.setItem('user', JSON.stringify({ id: 9, name: 'Yo', email: 'yo@example.test', role, permissions: [] }));
};

describe('A-07: lista de docentes sin emails y con «Escribir»', () => {
  let http: HttpTestingController;
  const create = (role: 'student' | 'teacher', rows: unknown[], available: unknown[] = []) => {
    session(role);
    const fixture = TestBed.createComponent(TeachersComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/users/teachers`).flush(rows);
    if (role === 'student') http.expectOne(`${environment.apiUrl}/teachers/available`).flush(available);
    fixture.detectChanges();
    return fixture;
  };
  const rows = [{ id: 1, name: 'Ana Docente', coursesCount: 3 }, { id: 2, name: 'Beto Docente', coursesCount: 1 }];

  beforeEach(() => {
    localStorage.clear(); localStorage.setItem('spanishnow.locale', 'es');
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  it('muestra nombre y cantidad de cursos, y ningún email', () => {
    const fixture = create('student', rows);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Ana Docente');
    expect(text).toContain('Beto Docente');
    expect(text).not.toContain('@');
    expect(fixture.nativeElement.querySelector('.teacher-card__email')).toBeNull();
  });

  it('«Escribir» aparece solo para docentes que reciben consultas y abre la conversación en /messages', () => {
    const fixture = create('student', rows, [{ id: 2, name: 'Beto Docente' }]);
    const buttons = fixture.nativeElement.querySelectorAll('[data-testid="teacher-write"]') as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('Escribir a Beto Docente');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    buttons[0].click();
    const req = http.expectOne(`${environment.apiUrl}/conversations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ teacherId: 2 });
    req.flush({ id: 77 });
    expect(navigate).toHaveBeenCalledWith(['/messages', 77]);
  });

  it('si no se puede abrir la consulta explica el motivo y no navega', () => {
    const fixture = create('student', rows, [{ id: 1, name: 'Ana Docente' }]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (fixture.nativeElement.querySelector('[data-testid="teacher-write"]') as HTMLButtonElement).click();
    http.expectOne(`${environment.apiUrl}/conversations`).flush({ error: 'x' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('un docente no ve el botón «Escribir» y ve su propio email si el servidor lo envía', () => {
    const fixture = create('teacher', [{ id: 9, name: 'Yo', email: 'yo@example.test', coursesCount: 2 }, { id: 2, name: 'Beto Docente', coursesCount: 1 }]);
    expect(fixture.nativeElement.querySelector('[data-testid="teacher-write"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('yo@example.test');
  });
});
