import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PracticeDialogComponent } from '../practice-dialog/practice-dialog.component';
import { MatchingComponent } from '../matching/matching.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-matching-modal',
  standalone: true,
  imports: [TranslatePipe, CommonModule, MatchingComponent, PracticeDialogComponent],
  template: `
    <app-practice-dialog [show]="show" [title]="'activities.matchingModal' | t" [goal]="'activities.matchingGoal' | t" (close)="onClose()">
      <!-- Se crea al abrir: así carga el vocabulario de la historia actual y no el de la primera vez. -->
      @if (show) {
        <app-matching embedded [unitId]="unitId" [vocabularyIds]="vocabularyIds" (completed)="onMatchingCompleted($event)" />
      }
    </app-practice-dialog>
  `
})
export class MatchingModalComponent {
  i18n = inject(I18nService);
  @Input() unitId!: number;
  @Input() vocabularyIds?: number[] | null;
  @Input() show = false;
  @Output() completed = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  private toastService = inject(ToastService);

  onClose(): void {
    this.close.emit();
  }

  onMatchingCompleted(accuracy: number): void {
    // Validate 80% accuracy requirement
    if (accuracy >= 80) {
      this.toastService.success(this.i18n.t('activities.matchingSuccess', {accuracy: this.i18n.formatNumber(accuracy)}));
      this.completed.emit();
    } else {
      this.toastService.warning(this.i18n.t('activities.matchingRetry'));
    }
  }
}
