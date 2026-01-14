import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlashcardComponent } from '../flashcard/flashcard.component';
import { EnrollmentService } from '../../../core/services/enrollment.service';

@Component({
  selector: 'app-flashcard-modal',
  standalone: true,
  imports: [CommonModule, FlashcardComponent],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1" (click)="onBackdropClick($event)">
      <div class="modal-dialog modal-xl" (click)="$event.stopPropagation()">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">📚 Flashcards de Vocabulario</h5>
            <button type="button" class="btn-close btn-close-white" (click)="onClose()" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <app-flashcard
              [unitId]="unitId"
              (allViewed)="onAllViewed()">
            </app-flashcard>
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
export class FlashcardModalComponent {
  @Input() unitId!: number;
  @Input() show = false;
  @Input() progressId!: number;
  @Output() completed = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  private enrollmentService = inject(EnrollmentService);

  onClose(): void {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    // Close modal when clicking on backdrop (outside dialog)
    this.close.emit();
  }

  onAllViewed(): void {
    // Mark flashcards as viewed in progress tracking
    if (this.progressId) {
      // TODO: Create endpoint POST /api/progress/:progressId/flashcards-viewed
      // For now, just emit completion
      console.log('Flashcards viewed for progress:', this.progressId);
    }

    this.completed.emit();
  }
}
