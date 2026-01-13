import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ListenRepeatComponent } from '../listen-repeat/listen-repeat.component';
import { EnrollmentService } from '../../../core/services/enrollment.service';

@Component({
  selector: 'app-listen-repeat-modal',
  standalone: true,
  imports: [CommonModule, ListenRepeatComponent],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header bg-warning text-dark">
            <h5 class="modal-title">🎤 Listen & Repeat</h5>
            <button type="button" class="btn-close" (click)="close.emit()" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info mb-3">
              <strong>Objetivo:</strong> Debes obtener 3+ estrellas en al menos 80% de las frases para completar esta actividad.
            </div>
            <app-listen-repeat
              [storyId]="storyId"
              (completed)="onListenRepeatCompleted($event)">
            </app-listen-repeat>
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
  @Input() storyId!: number;
  @Input() show = false;
  @Input() progressId!: number;
  @Output() completed = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  private enrollmentService = inject(EnrollmentService);

  onListenRepeatCompleted(result: { totalPhrases: number; goodPerformance: number }): void {
    // Validate 3+ stars in 80% of phrases requirement
    const accuracyPercentage = (result.goodPerformance / result.totalPhrases) * 100;

    if (accuracyPercentage >= 80) {
      // Mark listen & repeat as completed in progress tracking
      if (this.progressId) {
        // TODO: Create endpoint POST /api/progress/:progressId/listen-repeat-completed
        // For now, just emit completion
        console.log('Listen & Repeat completed with', accuracyPercentage.toFixed(1), '% accuracy for progress:', this.progressId);
      }

      this.completed.emit();
    } else {
      alert('Necesitas 3+ estrellas en al menos 80% de las frases. Inténtalo de nuevo.');
    }
  }
}
