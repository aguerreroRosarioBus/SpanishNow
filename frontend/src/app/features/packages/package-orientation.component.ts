import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

type Section = 'catalog' | 'purchases' | 'groups';

/** Explica la tarea antes de iniciar la guía: catálogo, compras y grupos son destinos distintos. */
@Component({
  selector: 'app-package-orientation', standalone: true, imports: [RouterLink, TranslatePipe],
  template: `
    <section class="package-orientation" [attr.aria-labelledby]="'package-purpose-' + section()">
      <p class="eyebrow">{{ 'tutorial.packages.orientation' | t }}</p>
      <h2 [id]="'package-purpose-' + section()">{{ 'tutorial.packages.' + section() + '.heading' | t }}</h2>
      <p class="purpose">{{ 'tutorial.packages.' + section() + '.purpose' | t }}</p>
      <nav [attr.aria-label]="'tutorial.packages.related' | t">
        @for (destination of destinations; track destination.id) {
          @if (destination.id !== section()) {
            <a [routerLink]="destination.path">{{ 'tutorial.packages.' + destination.id + '.link' | t }} <span aria-hidden="true">→</span></a>
          }
        }
      </nav>
    </section>
  `,
  styles: [`
    :host{display:block;margin:1rem 0 1.5rem}
    .package-orientation{padding:1.25rem;border:1px solid var(--color-border);border-left:4px solid var(--color-primary);border-radius:12px;background:#fffdfa}
    h2{font-size:1.125rem;margin:0 0 .5rem}.eyebrow{margin:0 0 .4rem;font-size:.6875rem;letter-spacing:.06em;color:var(--color-text-light);font-weight:700}
    .purpose{max-width:75ch;line-height:1.6;margin:0;color:var(--color-text-light)}
    nav{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem;margin-top:.5rem}a{display:inline-flex;align-items:center;gap:.5rem;min-height:44px;font-size:.8125rem;font-weight:700;text-decoration:none}a:hover{text-decoration:underline}a:focus-visible{outline:3px solid #2f6f9f;outline-offset:2px}
  `],
})
export class PackageOrientationComponent {
  readonly section = input.required<Section>();
  readonly destinations = [
    { id: 'catalog', path: '/teacher/class-packages' },
    { id: 'purchases', path: '/teacher/class-purchases' },
    { id: 'groups', path: '/teacher/class-cohorts' },
  ] as const;
}
