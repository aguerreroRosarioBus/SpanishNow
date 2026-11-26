import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PracticeDialogComponent } from '../practice-dialog/practice-dialog.component';
import { ListenRepeatComponent } from '../listen-repeat/listen-repeat.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-listen-repeat-modal',
  standalone: true,
  imports: [TranslatePipe, CommonModule, ListenRepeatComponent, PracticeDialogComponent],
  template: `
    <app-practice-dialog [show]="show" [title]="'activities.repeatModal' | t" [goal]="'activities.repeatGoal' | t" (close)="onClose()">
      @if (storyId) {
        <app-listen-repeat embedded [storyId]="storyId" (completed)="onListenRepeatCompleted($event)" />
      } @else {
        <p class="practice-state">{{ 'activities.noRepeatUnit' | t }}</p>
      }
    </app-practice-dialog>
  `
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
