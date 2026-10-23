import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface HotmartSetup {
  /** URL del webhook de Hotmart (Herramientas → Webhook). Solo llega a quien administra Hotmart (`canManage`). */
  webhookUrl?: string;
  /** Si el servidor ya tiene el token (HOTMART_HOTTOK). */
  configured: boolean;
  /** Tiene el permiso class_packages.manage_all: ve y administra el webhook de la cuenta única de Hotmart. */
  canManage: boolean;
}

/** Datos para configurar Hotmart (solo docente; el webhook, solo quien administra Hotmart). */
@Injectable({ providedIn: 'root' })
export class HotmartService {
  private http = inject(HttpClient);

  setup(): Observable<HotmartSetup> {
    return this.http.get<HotmartSetup>(`${environment.apiUrl}/teacher/hotmart`);
  }
}
