import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div
        *ngFor="let toast of toastService.getToasts()"
        class="toast-item"
        [class.toast-success]="toast.type === 'success'"
        [class.toast-error]="toast.type === 'error'"
        [class.toast-warning]="toast.type === 'warning'"
        [class.toast-info]="toast.type === 'info'"
      >
        <div class="toast-content">
          <span class="toast-icon">{{ getIcon(toast.type) }}</span>
          <span class="toast-message">{{ toast.message }}</span>
        </div>
        <button type="button" class="toast-close" (click)="toastService.remove(toast.id)" aria-label="Close">
          ×
        </button>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 400px;
    }

    .toast-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      background: white;
      border-left: 4px solid;
      animation: slideIn 0.3s ease-out;
      min-width: 320px;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    .toast-content {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }

    .toast-icon {
      font-size: 24px;
      line-height: 1;
    }

    .toast-message {
      font-size: 14px;
      line-height: 1.5;
      color: var(--color-text);
      font-weight: 500;
    }

    .toast-close {
      background: none;
      border: none;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
      color: var(--color-text-light);
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: all 0.2s ease;
      flex-shrink: 0;
      pointer-events: auto;
      position: relative;
      z-index: 10;
    }

    .toast-close:hover {
      background-color: rgba(0, 0, 0, 0.05);
      color: var(--color-text);
    }

    .toast-success {
      border-left-color: var(--color-success);
      background: #ffffff;
      border: 1px solid var(--color-border);
    }

    .toast-success .toast-icon {
      color: var(--color-success);
    }

    .toast-error {
      border-left-color: var(--color-danger);
      background: #ffffff;
      border: 1px solid var(--color-danger-soft);
    }

    .toast-error .toast-icon {
      color: var(--color-danger);
    }

    .toast-warning {
      border-left-color: var(--color-warning);
      background: #ffffff;
      border: 1px solid var(--color-warning-soft);
    }

    .toast-warning .toast-icon {
      color: var(--color-primary);
    }

    .toast-info {
      border-left-color: var(--color-info);
      background: #ffffff;
      border: 1px solid var(--color-border);
    }

    .toast-info .toast-icon {
      color: var(--color-info);
    }

    @media (max-width: 768px) {
      .toast-container {
        right: 12px;
        left: 12px;
        max-width: none;
      }

      .toast-item {
        min-width: auto;
      }
    }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);

  getIcon(type: string): string {
    const icons: Record<string, string> = {
      'success': '✓',
      'error': '✕',
      'warning': '⚠',
      'info': 'ℹ'
    };
    return icons[type] || 'ℹ';
  }
}
