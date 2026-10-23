import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { CalendarCardComponent } from './calendar-card.component';
import { ZoomSummaryComponent } from '../zoom/zoom-summary.component';

/** Pantalla común de integraciones del docente (W07). Cada proveedor aporta su tarjeta; Zoom (W08) aporta un resumen con enlace a su página. */
@Component({
  selector: 'app-integrations', standalone: true, imports: [TranslatePipe, CalendarCardComponent, ZoomSummaryComponent, RouterLink],
  template: `<div class="page-container" style="max-width:760px;margin:0 auto"><h1>{{ 'calendar.title' | t }}</h1><app-zoom-summary /><app-calendar-card /></div>`
})
export class IntegrationsComponent {}
