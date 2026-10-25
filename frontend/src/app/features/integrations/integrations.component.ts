import { RouterLink } from '@angular/router';
import { Component } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { CalendarCardComponent } from './calendar-card.component';
import { ZoomSummaryComponent } from '../zoom/zoom-summary.component';

/** Pantalla común de integraciones del docente (W07). Cada proveedor aporta su tarjeta dentro de un grupo con encabezado; Zoom (W08) aporta un resumen con enlace a su página. */
@Component({
  selector: 'app-integrations', standalone: true, imports: [RouterLink, TranslatePipe, CalendarCardComponent, ZoomSummaryComponent],
  styles: [`.integrations{max-width:760px}.lead{margin:0 0 var(--spacing-lg);font-size:1rem;color:var(--color-text-light)}.group{margin-bottom:var(--spacing-lg)}.group-title{margin:0 0 var(--spacing-sm);font-size:.8125rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--color-text-light)}`],
  template: `<div class="page-container integrations">
  <h1>{{ 'calendar.title' | t }}</h1>
  <p class="lead">{{ 'calendar.lead' | t }}</p>
  <section class="group" aria-labelledby="groupMeetings"><h2 id="groupMeetings" class="group-title">{{ 'calendar.groupMeetings' | t }}</h2><app-zoom-summary /></section>
  <section class="group" aria-labelledby="groupCalendar"><h2 id="groupCalendar" class="group-title">{{ 'calendar.groupCalendar' | t }}</h2><app-calendar-card /></section>
<a routerLink="/live" class="btn btn-secondary">{{'refine.otherIntegrations'|t}}</a></div>`
})
export class IntegrationsComponent {}
