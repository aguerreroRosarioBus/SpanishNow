import { Component } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { CalendarCardComponent } from './calendar-card.component';

/** Pantalla común de integraciones del docente (W07). Cada proveedor aporta su tarjeta; W08 agrega la de Zoom. */
@Component({
  selector: 'app-integrations', standalone: true, imports: [TranslatePipe, CalendarCardComponent],
  template: `<div class="page-container" style="max-width:760px;margin:0 auto"><h1>{{ 'calendar.title' | t }}</h1><app-calendar-card /></div>`
})
export class IntegrationsComponent {}
