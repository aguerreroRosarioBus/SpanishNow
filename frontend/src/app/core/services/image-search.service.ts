import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ImageSearchResult {
  title: string;
  thumbnailUrl: string;
  sourceUrl: string | null;
  source: string;
  token: string;
}
export interface ImageSearchPage { results: ImageSearchResult[]; page: number; hasMore: boolean; provider?: 'pixabay' | 'google'; }

@Injectable({ providedIn: 'root' })
export class ImageSearchService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/images`;
  search(query: string, page = 1): Observable<ImageSearchPage> {
    return this.http.get<ImageSearchPage>(`${this.url}/search`, { params: { q: query, page } });
  }
  importImage(token: string): Observable<Blob> {
    return this.http.post(`${this.url}/import`, { token }, { responseType: 'blob' });
  }
}
