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
      color: #1a1a1a;
      font-weight: 500;
    }

    .toast-close {
      background: none;
      border: none;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
      color: #6c757d;
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
      color: #2c3e50;
    }

    .toast-success {
      border-left-color: #28a745;
      background: #ffffff;
      border: 1px solid #d4edda;
    }

    .toast-success .toast-icon {
      color: #28a745;
    }

    .toast-error {
      border-left-color: #dc3545;
      background: #ffffff;
      border: 1px solid #f8d7da;
    }

    .toast-error .toast-icon {
      color: #dc3545;
    }

    .toast-warning {
      border-left-color: #ffc107;
      background: #ffffff;
      border: 1px solid #fff3cd;
    }

    .toast-warning .toast-icon {
      color: #f57c00;
    }

    .toast-info {
      border-left-color: #17a2b8;
      background: #ffffff;
      border: 1px solid #d1ecf1;
    }

    .toast-info .toast-icon {
      color: #17a2b8;
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
