import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ImageSearchResult, ImageSearchService } from '../../../core/services/image-search.service';
import { IconComponent } from '../icon/icon.component';

/** Downloads the selected result as a File so every editor uses its existing upload/save flow. */
@Component({
  selector: 'app-image-search',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './image-search.component.html',
  styleUrl: './image-search.component.scss'
})
export class ImageSearchComponent {
  private api = inject(ImageSearchService);
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
  error = signal('');
  searched = signal(false);
  page = signal(1);
  hasMore = signal(false);
  private searchedQuery = '';

  constructor() { inject(DestroyRef).onDestroy(() => { this.alive = false; this.request++; }); }

  toggle(): void {
    if (this.disabled() || this.importing()) return;
    this.expanded.update(value => !value);
    if (this.expanded() && !this.query()) this.query.set(this.initialQuery().slice(0, 200));
  }

  async search(page = 1): Promise<void> {
    if (this.disabled() || this.loading() || this.importing()) return;
    const query = page === 1 ? this.query().trim() : this.searchedQuery;
    if (!query) return;
    const request = ++this.request;
    this.loading.set(true); this.error.set('');
    try {
      const result = await firstValueFrom(this.api.search(query, page));
      if (!this.alive || request !== this.request) return;
      this.results.set(result.results); this.page.set(result.page); this.hasMore.set(result.hasMore);
      this.searched.set(true); this.searchedQuery = query;
    } catch (e: any) {
      if (this.alive && request === this.request) this.error.set(e?.error?.error || 'No se pudo buscar. Inténtalo de nuevo.');
    } finally { if (this.alive && request === this.request) this.loading.set(false); }
  }

  async select(result: ImageSearchResult): Promise<void> {
    if (this.disabled() || this.importing() || this.loading()) return;
    this.importing.set(result.token); this.error.set('');
    try {
      const blob = await firstValueFrom(this.api.importImage(result.token));
      if (!this.alive || this.disabled()) return;
      const extension: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
      if (!extension[blob.type]) throw new Error();
      this.imageSelected.emit(new File([blob], `google-image.${extension[blob.type]}`, { type: blob.type }));
      this.expanded.set(false);
    } catch (e: any) {
      let message = e?.error?.error;
      // HttpClient returns API errors as Blobs when responseType is blob.
      if (e?.error instanceof Blob) {
        try { message = JSON.parse(await e.error.text()).error; } catch { /* fallback below */ }
      }
      if (this.alive) this.error.set(message || 'No se pudo insertar esta imagen. Elige otra o vuelve a intentar.');
    } finally { if (this.alive) this.importing.set(null); }
  }

  onEnter(event: Event): void {
    event.preventDefault(); event.stopPropagation(); void this.search();
  }
}
