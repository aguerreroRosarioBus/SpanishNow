import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header" [class.bg-danger]="type === 'danger'" [class.text-white]="type === 'danger'">
            <h5 class="modal-title">
              <span *ngIf="type === 'danger'">⚠️</span>
              <span *ngIf="type === 'warning'">⚠️</span>
              {{ title }}
            </h5>
          </div>
          <div class="modal-body">
            <p>{{ message }}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="onCancel()">
              Cancelar
            </button>
            <button
              type="button"
              class="btn"
              [class.btn-danger]="type === 'danger'"
              [class.btn-warning]="type === 'warning'"
              (click)="onConfirm()">
              {{ confirmText }}
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
export class ConfirmDialogComponent {
  @Input() show = false;
  @Input() title = 'Confirmar';
  @Input() message = '¿Estás seguro?';
  @Input() confirmText = 'Confirmar';
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
