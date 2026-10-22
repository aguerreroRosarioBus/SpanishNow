import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlashcardComponent } from '../flashcard/flashcard.component';

@Component({
  selector: 'app-flashcard-modal',
  standalone: true,
  imports: [TranslatePipe, CommonModule, FlashcardComponent],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1" (click)="onBackdropClick($event)">
      <div class="modal-dialog modal-xl" (click)="$event.stopPropagation()">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">{{ 'activities.flashcardsModal' | t }}</h5>
            <button type="button" class="btn-close btn-close-white" (click)="onClose()" [attr.aria-label]="'activities.close' | t"></button>
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
  i18n = inject(I18nService);
  @Input() unitId!: number;
  @Input() show = false;
  @Output() completed = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  onClose(): void {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    // Close modal when clicking on backdrop (outside dialog)
    this.close.emit();
  }

  onAllViewed(): void {
    this.completed.emit();
  }
}
