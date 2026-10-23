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
      <div class="modal-dialog modal-xl" (click)="$event.stopPropagation()">
        <div class="modal-content">
          <div class="modal-header bg-warning text-dark">
            <h5 class="modal-title">{{ 'activities.repeatModal' | t }}</h5>
            <button type="button" class="btn-close btn-close-white" (click)="onClose()" [attr.aria-label]="'activities.close' | t"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info mb-3">
              <strong>{{ 'activities.objective' | t }}</strong> {{ 'activities.repeatGoal' | t }}
            </div>
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
