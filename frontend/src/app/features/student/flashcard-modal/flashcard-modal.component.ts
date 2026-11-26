import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PracticeDialogComponent } from '../practice-dialog/practice-dialog.component';
import { FlashcardComponent } from '../flashcard/flashcard.component';

@Component({
  selector: 'app-flashcard-modal',
  standalone: true,
  imports: [TranslatePipe, CommonModule, FlashcardComponent, PracticeDialogComponent],
  template: `
    <app-practice-dialog [show]="show" [title]="'activities.flashcardsModal' | t" [goal]="'activities.flashcardGoal' | t" (close)="onClose()">
      <!-- Se crea al abrir: así carga el vocabulario de la historia actual y no el de la primera vez. -->
      @if (show) {
        <app-flashcard embedded [unitId]="unitId" [vocabularyIds]="vocabularyIds" (allViewed)="onAllViewed()" />
      }
    </app-practice-dialog>
  `
})
export class FlashcardModalComponent {
  i18n = inject(I18nService);
  @Input() unitId!: number;
  @Input() vocabularyIds?: number[] | null;
  @Input() show = false;
  @Output() completed = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  onClose(): void {
    this.close.emit();
  }

  onAllViewed(): void {
    this.completed.emit();
  }
}
