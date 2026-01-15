import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ListenRepeatComponent } from '../listen-repeat/listen-repeat.component';
import { ProgressService } from '../../../core/services/progress.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-listen-repeat-modal',
  standalone: true,
  imports: [CommonModule, ListenRepeatComponent],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1" (click)="onBackdropClick($event)">
      <div class="modal-dialog modal-xl" (click)="$event.stopPropagation()">
        <div class="modal-content">
          <div class="modal-header bg-warning text-dark">
            <h5 class="modal-title">🎤 Listen & Repeat</h5>
            <button type="button" class="btn-close btn-close-white" (click)="onClose()" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info mb-3">
              <strong>Objetivo:</strong> Debes obtener 3+ estrellas en al menos 80% de las frases para completar esta actividad.
            </div>
            <app-listen-repeat
              *ngIf="storyId"
              [storyId]="storyId"
              (completed)="onListenRepeatCompleted($event)">
            </app-listen-repeat>
            <div *ngIf="!storyId" class="alert alert-warning">
              No se encontraron actividades de escuchar y repetir para esta unidad.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="onClose()">
              Cerrar
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
  `]
})
export class ListenRepeatModalComponent {
  @Input() storyId?: number;
  @Input() show = false;
  @Input() progressId!: number;
  @Output() completed = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  private progressService = inject(ProgressService);
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
      // Mark listen & repeat as completed in progress tracking
      if (this.progressId) {
        this.progressService.markListenRepeatCompleted(this.progressId).subscribe({
          next: (progress) => {
            console.log('Listen & Repeat marked as completed:', progress);
            this.toastService.success(`¡Completado con ${Math.round(accuracyPercentage)}% de frases exitosas!`);
            this.completed.emit();
          },
          error: (error) => {
            console.error('Error marking listen & repeat as completed:', error);
            // Still emit completion even if tracking fails
            this.completed.emit();
          }
        });
      } else {
        this.completed.emit();
      }
    } else {
      this.toastService.warning('Necesitas 3+ estrellas en al menos 80% de las frases. Inténtalo de nuevo.');
    }
  }
}
