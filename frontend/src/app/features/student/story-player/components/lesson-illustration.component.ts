import { Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';

/** Ilustración con proporción fija 4:3 (sin saltos de diseño) y vista ampliada accesible al pulsar o con Enter. */
@Component({
  selector: 'app-lesson-illustration',
  standalone: true,
  template: `
    <button type="button" class="ill-open" [class.compact]="compact()" aria-haspopup="dialog" [attr.aria-label]="'Ampliar ilustración: ' + alt()" (click)="open()">
      <img [src]="src()" [alt]="alt()" loading="lazy" width="400" height="300">
    </button>
    @if (enlarged()) {
      <div class="ill-overlay" role="dialog" aria-modal="true" aria-label="Ilustración ampliada" (click)="close()">
        <button type="button" class="ill-close" aria-label="Cerrar" (click)="close()">&times;</button>
        <img [src]="src()" [alt]="alt()" (click)="$event.stopPropagation()">
      </div>
    }
  `,
  styleUrl: './lesson-illustration.component.scss'
})
export class LessonIllustrationComponent {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  src = input.required<string>();
  alt = input.required<string>();
  compact = input(false);
  enlarged = signal(false);

  open(): void {
    this.enlarged.set(true);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.ill-close')?.focus(), 0);
  }
  close(): void {
    this.enlarged.set(false);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.ill-open')?.focus(), 0);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.enlarged()) return;
    if (event.key === 'Escape') { event.preventDefault(); this.close(); }
    else if (event.key === 'Tab') { event.preventDefault(); this.host.nativeElement.querySelector<HTMLElement>('.ill-close')?.focus(); } // único control del diálogo
  }
}
