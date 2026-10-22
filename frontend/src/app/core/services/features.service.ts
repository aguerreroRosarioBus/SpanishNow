import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type FeatureName = 'chat' | 'class_packages' | 'class_scheduling' | 'google_calendar' | 'zoom';

/** Módulos de clases/chat encendidos en el backend (GET /api/features, CONTRATO.md §11). Sin respuesta = apagados. */
@Injectable({ providedIn: 'root' })
export class FeaturesService {
  private http = inject(HttpClient);
  private readonly flags = signal<Partial<Record<FeatureName, boolean>>>({});
  private loaded = false;

  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.http.get<Partial<Record<FeatureName, boolean>>>(`${environment.apiUrl}/features`).subscribe({
      next: flags => this.flags.set(flags ?? {}),
      error: () => { this.loaded = false; }
    });
  }

  enabled(name: FeatureName): boolean { return this.flags()[name] === true; }
}
