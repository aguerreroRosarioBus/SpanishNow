import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatchingComponent } from '../matching/matching.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-matching-modal',
  standalone: true,
  imports: [TranslatePipe, CommonModule, MatchingComponent],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1" (click)="onBackdropClick($event)">
      <div class="modal-dialog modal-xl" (click)="$event.stopPropagation()">
        <div class="modal-content">
          <div class="modal-header bg-success text-white">
            <h5 class="modal-title">{{ 'activities.matchingModal' | t }}</h5>
            <button type="button" class="btn-close btn-close-white" (click)="onClose()" [attr.aria-label]="'activities.close' | t"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info mb-3">
              <strong>{{ 'activities.objective' | t }}</strong> {{ 'activities.matchingGoal' | t }}
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
  i18n = inject(I18nService);
  @Input() unitId!: number;
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
