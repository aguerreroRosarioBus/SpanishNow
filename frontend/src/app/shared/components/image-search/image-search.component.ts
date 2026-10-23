import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ImageSearchResult, ImageSearchService } from '../../../core/services/image-search.service';
import { IconComponent } from '../icon/icon.component';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

interface SearchFailure { key: string; error?: unknown; }

/** Downloads the selected result as a File so every editor uses its existing upload/save flow. */
@Component({
  selector: 'app-image-search',
  standalone: true,
  imports: [IconComponent, TranslatePipe],
  templateUrl: './image-search.component.html',
  styleUrl: './image-search.component.scss'
})
export class ImageSearchComponent {
  private api = inject(ImageSearchService);
  private i18n = inject(I18nService);
  private alive = true;
  private request = 0;
  initialQuery = input('');
  disabled = input(false);
  imageSelected = output<File>();
  expanded = signal(false);
  query = signal('');
  results = signal<ImageSearchResult[]>([]);
  loading = signal(false);
  importing = signal<string | null>(null);
  /** Error pendiente de traducir: se traduce al leer para seguir el idioma activo. */
  private failure = signal<SearchFailure | null>(null);
  error = computed(() => {
    const f = this.failure();
    return f ? this.i18n.errorMessage(f.error, f.key) : '';
  });
  searched = signal(false);
  page = signal(1);
  hasMore = signal(false);
  provider = signal('');
  private searchedQuery = '';

  constructor() { inject(DestroyRef).onDestroy(() => { this.alive = false; this.request++; }); }

  toggle(): void {
    if (this.disabled() || this.importing()) return;
    this.expanded.update(value => !value);
    if (this.expanded() && !this.query()) this.query.set(this.initialQuery().slice(0, 100));
  }

  async search(page = 1): Promise<void> {
    if (this.disabled() || this.loading() || this.importing()) return;
    const query = page === 1 ? this.query().trim() : this.searchedQuery;
    if (!query) return;
    const request = ++this.request;
    this.loading.set(true); this.failure.set(null);
    try {
      const result = await firstValueFrom(this.api.search(query, page));
      if (!this.alive || request !== this.request) return;
      this.results.set(result.results); this.page.set(result.page); this.hasMore.set(result.hasMore);
      this.provider.set(result.provider || '');
      this.searched.set(true); this.searchedQuery = query;
    } catch (e: any) {
      if (this.alive && request === this.request) this.failure.set({ key: 'teacherComposer.imageSearch.searchError', error: e });
    } finally { if (this.alive && request === this.request) this.loading.set(false); }
  }

  async select(result: ImageSearchResult): Promise<void> {
    if (this.disabled() || this.importing() || this.loading()) return;
    this.importing.set(result.token); this.failure.set(null);
    try {
      const blob = await firstValueFrom(this.api.importImage(result.token));
      if (!this.alive || this.disabled()) return;
      const extension: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
      if (!extension[blob.type]) throw new Error();
      this.imageSelected.emit(new File([blob], `imagen.${extension[blob.type]}`, { type: blob.type }));
      this.expanded.set(false);
    } catch (e: any) {
      let failure: unknown = e;
      // HttpClient returns API errors as Blobs when responseType is blob.
      if (e?.error instanceof Blob) {
        try { failure = { status: e.status, error: JSON.parse(await e.error.text()) }; } catch { /* fallback below */ }
      }
      if (this.alive) this.failure.set({ key: 'teacherComposer.imageSearch.importError', error: failure });
    } finally { if (this.alive) this.importing.set(null); }
  }

  onEnter(event: Event): void {
    event.preventDefault(); event.stopPropagation(); void this.search();
  }
}
