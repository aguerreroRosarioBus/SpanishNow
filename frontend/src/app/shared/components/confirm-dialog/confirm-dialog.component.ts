import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ title || ('common.confirm' | t) }}</h5>
          </div>
          <div class="modal-body">
            <p class="mb-0">{{ message || ('common.areYouSure' | t) }}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="onCancel()">
              {{ 'common.cancel' | t }}
            </button>
            <button
              type="button"
              class="btn"
              [class.btn-danger]="type === 'danger'"
              [class.btn-warning]="type === 'warning'"
              (click)="onConfirm()">
              {{ confirmText || ('common.confirm' | t) }}
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
      z-index: 10000;
    }

    .modal-backdrop {
      z-index: 9999;
    }

    .modal-dialog {
      z-index: 10001;
    }
  `]
})
export class ConfirmDialogComponent {
  @Input() show = false;
  @Input() title = '';
  @Input() message = '';
  @Input() confirmText = '';
  @Input() type: 'danger' | 'warning' = 'danger';

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  onConfirm(): void {
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
