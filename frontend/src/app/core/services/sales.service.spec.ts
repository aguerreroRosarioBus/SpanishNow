import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SalesService } from './sales.service';
import { normalizeProgress } from './enrollment.service';

describe('SalesService', () => {
  let service: SalesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SalesService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lista órdenes con filtros y sin parámetros vacíos', () => {
    service.orders({ status: 'paid', courseId: 3, q: ' ana ', page: 2, pageSize: 20 }).subscribe();
    const req = http.expectOne(r => r.url.endsWith('/teacher/orders'));
    expect(req.request.params.get('status')).toBe('paid');
    expect(req.request.params.get('courseId')).toBe('3');
    expect(req.request.params.get('q')).toBe('ana');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ rows: [], total: 0 });
  });

  it('exporta el CSV como blob con los mismos filtros y sin paginación', () => {
    service.exportCsv({ status: 'refunded', page: 3, pageSize: 20 }).subscribe(b => expect(b.size).toBeGreaterThan(0));
    const req = http.expectOne(r => r.url.endsWith('/teacher/orders/export.csv'));
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('status')).toBe('refunded');
    expect(req.request.params.has('page')).toBe(false);
    req.flush(new Blob(['a,b']));
  });

  it('el reembolso manual manda revokeAccess y la confirmación explícita', () => {
    service.refund(5, false).subscribe();
    const req = http.expectOne(r => r.url.endsWith('/teacher/orders/5/refund'));
    expect(req.request.body).toEqual({ revokeAccess: false, manual: true });
    req.flush({});
  });

  it('el resumen manda from/to solo si existen', () => {
    service.summary('2026-01-01').subscribe();
    const req = http.expectOne(r => r.url.endsWith('/teacher/sales/summary'));
    expect(req.request.params.get('from')).toBe('2026-01-01');
    expect(req.request.params.has('to')).toBe(false);
    req.flush({ totals: [], byMonth: [], byCourse: [] });
  });
});

describe('normalizeProgress (next)', () => {
  it('conserva next y lo deja en null si falta', () => {
    const next = { course: { slug: 'p2', title: 'Parte 2', price: 4900, currency: 'usd' }, couponCode: 'X', alreadyEnrolled: false };
    expect(normalizeProgress({ stories: [], next }).next).toEqual(next);
    expect(normalizeProgress([]).next).toBeNull();
  });
});
