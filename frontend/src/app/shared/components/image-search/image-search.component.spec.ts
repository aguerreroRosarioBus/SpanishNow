import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ImageSearchComponent } from './image-search.component';
import { ImageSearchResult } from '../../../core/services/image-search.service';

const image: ImageSearchResult = { title: 'Una casa', thumbnailUrl: 'https://example.com/thumb.png', sourceUrl: 'https://example.com/casa', source: 'example.com', token: 'signed-selection' };
describe('ImageSearchComponent', () => {
  let fixture: ComponentFixture<ImageSearchComponent>;
  let component: ImageSearchComponent;
  let http: HttpTestingController;
  let selected: File[];
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ImageSearchComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ImageSearchComponent); component = fixture.componentInstance;
    fixture.componentRef.setInput('initialQuery', 'una casa');
    selected = []; component.imageSelected.subscribe(file => selected.push(file)); fixture.detectChanges();
  });
  afterEach(() => http.verify());
  function findSearch(page = 1) { return http.expectOne(r => r.url.endsWith('/images/search') && r.params.get('page') === String(page)); }
  async function populate() {
    component.toggle(); const pending = component.search();
    findSearch().flush({ results: [image], page: 1, hasMore: true, provider: 'pixabay' }); await pending; fixture.detectChanges();
  }
  it('opens with the suggested query and searches only on request, without a nested form', async () => {
    component.toggle(); fixture.detectChanges();
    expect(component.query()).toBe('una casa'); expect(fixture.nativeElement.querySelector('form')).toBeNull();
    http.expectNone(() => true);
    const pending = component.search(); const req = findSearch(); expect(req.request.params.get('q')).toBe('una casa');
    req.flush({ results: [image], page: 1, hasMore: true }); await pending; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.image-choice').getAttribute('aria-label')).toContain('Una casa');
    expect(fixture.nativeElement.querySelector('a.source').rel).toBe('noopener noreferrer');
  });
  it('imports only a selected signed result and emits a File usable by the existing upload flow', async () => {
    await populate(); const pending = component.select(image);
    const req = http.expectOne(r => r.url.endsWith('/images/import'));
    expect(req.request.body).toEqual({ token: image.token }); expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['png'], { type: 'image/png' })); await pending;
    expect(selected).toHaveLength(1); expect(selected[0]).toBeInstanceOf(File); expect(selected[0].type).toBe('image/png');
    expect(component.expanded()).toBe(false);
  });
  it('labels the search generically and credits Pixabay when returning its catalog', async () => {
    expect(fixture.nativeElement.textContent).toContain('Buscar imágenes');
    expect(fixture.nativeElement.textContent).not.toContain('Google Imágenes');
    await populate();
    const credit = fixture.nativeElement.querySelector('a[href="https://pixabay.com/"]');
    expect(credit.textContent).toBe('Pixabay'); expect(credit.rel).toBe('noopener noreferrer');
    expect(fixture.nativeElement.querySelector('input[type="search"]').maxLength).toBe(100);
  });
  it('preserves the selected file on download failure and displays the server error from a Blob', async () => {
    await populate(); const pending = component.select(image);
    const body = JSON.stringify({ error: 'La imagen supera los 5 MB.' });
    const blob = new Blob([body], { type: 'application/json' });
    // jsdom's Blob lacks text(), which modern browsers implement.
    Object.defineProperty(blob, 'text', { value: async () => body });
    http.expectOne(r => r.url.endsWith('/images/import')).flush(blob, { status: 413, statusText: 'Too Large' });
    await pending; expect(selected).toEqual([]); expect(component.error()).toContain('5 MB');
    expect(component.expanded()).toBe(true); expect(component.importing()).toBeNull();
  });
  it('shows missing-configuration errors and empty search results', async () => {
    component.toggle(); let pending = component.search();
    findSearch().flush({ error: 'La búsqueda no está configurada.' }, { status: 503, statusText: 'Unavailable' });
    await pending; expect(component.error()).toContain('configurada');
    pending = component.search(); findSearch().flush({ results: [], page: 1, hasMore: false }); await pending; fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No encontramos imágenes');
  });
  it('paginates the submitted query even if the search input changes', async () => {
    await populate(); component.query.set('otro texto'); const pending = component.search(2); const req = findSearch(2);
    expect(req.request.params.get('q')).toBe('una casa'); req.flush({ results: [image], page: 2, hasMore: false }); await pending;
    expect(component.page()).toBe(2); expect(component.hasMore()).toBe(false);
  });
  it('prevents duplicate downloads and honors disabled editors', async () => {
    await populate(); const pending = component.select(image); await component.select(image);
    http.expectOne(r => r.url.endsWith('/images/import')).flush(new Blob(['x'], { type: 'image/jpeg' })); await pending;
    fixture.componentRef.setInput('disabled', true); await component.search(); await component.select(image);
    expect(selected).toHaveLength(1); http.expectNone(() => true);
  });
  it('ignores downloads completed after the editor is destroyed', async () => {
    await populate(); const pending = component.select(image); const req = http.expectOne(r => r.url.endsWith('/images/import'));
    fixture.destroy(); req.flush(new Blob(['x'], { type: 'image/png' })); await pending; expect(selected).toEqual([]);
  });
  it('Enter searches without submitting or bubbling to the surrounding editor form', () => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    vi.spyOn(event, 'stopPropagation'); component.query.set('casa'); component.onEnter(event);
    expect(event.defaultPrevented).toBe(true); expect(event.stopPropagation).toHaveBeenCalled();
    findSearch().flush({ results: [], page: 1, hasMore: false });
  });
});
