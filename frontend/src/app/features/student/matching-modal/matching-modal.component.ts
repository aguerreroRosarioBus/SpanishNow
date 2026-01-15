import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatchingComponent } from '../matching/matching.component';
import { ProgressService } from '../../../core/services/progress.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-matching-modal',
  standalone: true,
  imports: [CommonModule, MatchingComponent],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1" (click)="onBackdropClick($event)">
      <div class="modal-dialog modal-xl" (click)="$event.stopPropagation()">
        <div class="modal-content">
          <div class="modal-header bg-success text-white">
            <h5 class="modal-title">🔗 Emparejar Vocabulario</h5>
            <button type="button" class="btn-close btn-close-white" (click)="onClose()" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info mb-3">
              <strong>Objetivo:</strong> Debes alcanzar al menos 80% de precisión para completar esta actividad.
            </div>
            <app-matching
              [unitId]="unitId"
              (completed)="onMatchingCompleted($event)">
            </app-matching>
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
export class MatchingModalComponent {
  @Input() unitId!: number;
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

  onMatchingCompleted(accuracy: number): void {
    // Validate 80% accuracy requirement
    if (accuracy >= 80) {
      // Mark matching as completed in progress tracking
      if (this.progressId) {
        this.progressService.markMatchingCompleted(this.progressId).subscribe({
          next: (progress) => {
            console.log('Matching marked as completed with', accuracy, '% accuracy:', progress);
            this.toastService.success(`¡Completado con ${accuracy}% de precisión!`);
            this.completed.emit();
          },
          error: (error) => {
            console.error('Error marking matching as completed:', error);
            // Still emit completion even if tracking fails
            this.completed.emit();
          }
        });
      } else {
        this.completed.emit();
      }
    } else {
      this.toastService.warning('Necesitas al menos 80% de precisión. Inténtalo de nuevo.');
    }
  }
}
