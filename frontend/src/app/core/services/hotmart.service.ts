import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface HotmartSetup {
  /** URL que el docente pega en Hotmart (Herramientas → Webhook). */
  webhookUrl: string;
  /** Si el servidor ya tiene el token (HOTMART_HOTTOK). */
  configured: boolean;
}

/** Datos para configurar Hotmart (solo docente). */
@Injectable({ providedIn: 'root' })
export class HotmartService {
  private http = inject(HttpClient);

  setup(): Observable<HotmartSetup> {
    return this.http.get<HotmartSetup>(`${environment.apiUrl}/teacher/hotmart`);
  }
}
