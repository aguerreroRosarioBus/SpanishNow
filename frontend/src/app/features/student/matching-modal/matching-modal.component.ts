import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatchingComponent } from '../matching/matching.component';
import { EnrollmentService } from '../../../core/services/enrollment.service';

@Component({
  selector: 'app-matching-modal',
  standalone: true,
  imports: [CommonModule, MatchingComponent],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header bg-success text-white">
            <h5 class="modal-title">🔗 Emparejar Vocabulario</h5>
            <button type="button" class="btn-close btn-close-white" (click)="close.emit()" aria-label="Close"></button>
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

  private enrollmentService = inject(EnrollmentService);

  onMatchingCompleted(accuracy: number): void {
    // Validate 80% accuracy requirement
    if (accuracy >= 80) {
      // Mark matching as completed in progress tracking
      if (this.progressId) {
        // TODO: Create endpoint POST /api/progress/:progressId/matching-completed
        // For now, just emit completion
        console.log('Matching completed with', accuracy, '% accuracy for progress:', this.progressId);
      }

      this.completed.emit();
    } else {
      alert('Necesitas al menos 80% de precisión. Inténtalo de nuevo.');
    }
  }
}
