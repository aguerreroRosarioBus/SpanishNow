import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ListenRepeatComponent } from '../listen-repeat/listen-repeat.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-listen-repeat-modal',
  standalone: true,
  imports: [TranslatePipe, CommonModule, ListenRepeatComponent],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1" (click)="onBackdropClick($event)">
      <div class="modal-dialog modal-lg" (click)="$event.stopPropagation()">
        <div class="modal-content">
          <div class="modal-header bg-warning text-dark">
            <h5 class="modal-title">{{ 'activities.repeatModal' | t }}</h5>
            <button type="button" class="btn-close btn-close-white" (click)="onClose()" [attr.aria-label]="'activities.close' | t"></button>
          </div>
          <div class="modal-body">
            <p class="goal text-muted mb-2"><small><strong>{{ 'activities.objective' | t }}</strong> {{ 'activities.repeatGoal' | t }}</small></p>
            <app-listen-repeat
              *ngIf="storyId"
              [storyId]="storyId"
              (completed)="onListenRepeatCompleted($event)">
            </app-listen-repeat>
            <div *ngIf="!storyId" class="alert alert-warning">
              {{ 'activities.noRepeatUnit' | t }}
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="onClose()">
              {{ 'activities.close' | t }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade" [class.show]="show" *ngIf="show"></div>
  `,
  styles: [`
    .modal {
      background-color: rgba(0, 0, 0, 0.5);
    }
    /* La ventana nunca supera el alto visible: el contenido se compacta en vez de generar scroll. */
    .modal-dialog {
      margin: 1rem auto;
      max-height: calc(100dvh - 2rem);
    }
    .modal-content {
      max-height: calc(100dvh - 2rem);
      border-radius: var(--radius-xl);
      overflow: hidden;
    }
    .modal-body {
      min-height: 0;
      max-height: calc(100dvh - 2rem);
      overflow-y: auto;
      padding: 0.75rem 1rem;
    }
    .modal-header, .modal-footer { padding: 0.5rem 1rem; }
    /* En pantallas angostas el botón de la cabecera alcanza para cerrar y se gana alto. */
    @media (max-width: 575.98px) { .modal-footer { display: none; } }
  `]
})
export class ListenRepeatModalComponent {
  i18n = inject(I18nService);
  @Input() storyId?: number;
  @Input() show = false;
  @Output() completed = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  private toastService = inject(ToastService);

  onClose(): void {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    this.close.emit();
  }

  onListenRepeatCompleted(result: { totalPhrases: number; goodPerformance: number }): void {
    const accuracyPercentage = (result.goodPerformance / result.totalPhrases) * 100;

    if (accuracyPercentage >= 80) {
      this.toastService.success(this.i18n.t('activities.repeatSuccess', {accuracy: this.i18n.formatNumber(Math.round(accuracyPercentage))}));
      this.completed.emit();
    } else {
      this.toastService.warning(this.i18n.t('activities.repeatRetry'));
    }
  }
}
