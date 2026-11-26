import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-hotmart-guide-image',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <details class="small mt-2">
      <summary class="text-primary">{{ label() | t }}</summary>
      <a class="d-block mt-2" [href]="url()" target="_blank" rel="noopener noreferrer">
        <img class="img-fluid border rounded" [src]="url()" [alt]="label() | t" loading="lazy" decoding="async" />
      </a>
    </details>
  `
})
export class HotmartGuideImageComponent {
  readonly file = input.required<string>();
  readonly label = input.required<string>();
  readonly url = computed(() => `help/hotmart/${this.file()}.webp`);
}
