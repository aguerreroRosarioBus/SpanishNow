import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Material } from '../../../core/models/course.model';
import { MaterialService, formatFileSize } from '../../../core/services/material.service';
import { IconComponent } from '../icon/icon.component';

/** Lista de PDFs con botón de descarga: pide un link de vencimiento corto y lo abre en una pestaña nueva. */
@Component({
  selector: 'app-materials-list',
  standalone: true,
  imports: [TranslatePipe, IconComponent],
  template: `
    @if (list().length) {
      <section class="materials" [attr.aria-label]="displayHeading()">
        <h3 class="materials__title">{{ displayHeading() }}</h3>
        <ul class="materials__list">
          @for (m of list(); track m.id) {
            <li class="materials__item">
              <app-icon name="file-text" [size]="18" />
              <span class="materials__name">{{ m.title }}</span>
              @if (m.sizeBytes) { <span class="materials__size">{{ size(m.sizeBytes) }}</span> }
              <button type="button" class="btn btn-secondary btn-sm" (click)="download(m)" [disabled]="busyId() === m.id"
                      [attr.aria-label]="'lessonComments.downloadNamed' | t: {title: m.title}">
                @if (busyId() === m.id) { <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> }
                @else { <app-icon name="download" [size]="15" /> }
                {{ 'lessonComments.download' | t }}
              </button>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: [`
    :host { display: block; }
    .materials { padding: 16px 20px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
    .materials__title { margin: 0 0 8px; font: 600 1rem/1.3 var(--font-heading); }
    .materials__list { list-style: none; margin: 0; padding: 0; }
    .materials__item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--color-divider); }
    .materials__item:first-child { border-top: 0; }
    .materials__name { flex: 1; min-width: 0; font-weight: 600; font-size: 0.9375rem; overflow-wrap: anywhere; }
    .materials__size { color: var(--color-text-light); font-size: 0.8125rem; white-space: nowrap; }
  `]
})
export class MaterialsListComponent {
  i18n = inject(I18nService);
  private api = inject(MaterialService);

  materials = input<Material[] | null | undefined>([]);
  list = computed(() => this.materials() ?? []);
  heading = input('');
  displayHeading = computed(() => this.heading() || this.i18n.t('lessonComments.materials'));
  busyId = signal<number | null>(null);
  size(bytes: number): string { return formatFileSize(bytes, this.i18n.intlLocale()); }

  download(material: Material): void {
    if (this.busyId() !== null) return;
    this.busyId.set(material.id);
    this.api.download(material.id, () => this.busyId.set(null));
  }
}
