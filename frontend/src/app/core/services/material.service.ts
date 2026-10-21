import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Material } from '../models/course.model';
import { DownloadUrl } from '../models/content.model';
import { ToastService } from './toast.service';
import { environment } from '../../../environments/environment';

/** PDFs descargables: gestión del docente y descarga del alumno (siempre vía download-url). */
@Injectable({ providedIn: 'root' })
export class MaterialService {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private apiUrl = environment.apiUrl;

  list(courseId: number): Observable<Material[]> {
    return this.http.get<Material[]>(`${this.apiUrl}/courses/${courseId}/materials`);
  }

  /** `file` + `title` y, opcionalmente, `unitId` o `storyId` (a lo sumo uno). */
  upload(courseId: number, formData: FormData): Observable<Material> {
    return this.http.post<Material>(`${this.apiUrl}/courses/${courseId}/materials`, formData);
  }

  update(id: number, data: { title?: string; order?: number }): Observable<Material> {
    return this.http.put<Material>(`${this.apiUrl}/materials/${id}`, data);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/materials/${id}`);
  }

  getDownloadUrl(id: number): Observable<DownloadUrl> {
    return this.http.get<DownloadUrl>(`${this.apiUrl}/materials/${id}/download-url`);
  }

  /**
   * Pide el link de vencimiento corto (con el token) y lo abre en una pestaña nueva.
   * La pestaña se abre antes de la petición para que el navegador no la bloquee como popup.
   */
  download(id: number, onDone?: () => void): void {
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    this.getDownloadUrl(id).subscribe({
      next: ({ url }) => {
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
        onDone?.();
      },
      error: error => {
        tab?.close();
        this.toast.error(error?.status === 403 || error?.status === 401
          ? 'No tienes acceso a este material'
          : 'No se pudo preparar la descarga. Intenta nuevamente.');
        onDone?.();
      }
    });
  }
}

/** «1,2 MB», «340 KB». */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
