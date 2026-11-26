import { Component, inject } from '@angular/core';
import { ToastService, ToastType } from '../../../core/services/toast.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';

/** Avisos flotantes: arriba a la derecha en escritorio y abajo centrados en móvil. */
@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [IconComponent, TranslatePipe],
  template: `
    <div class="toast-container">
      @for (toast of toastService.getToasts(); track toast.id) {
        <div
          class="toast-item"
          animate.leave="toast-leave"
          [class]="'toast-' + toast.type"
          [attr.role]="toast.type === 'error' ? 'alert' : 'status'"
          [attr.aria-live]="toast.type === 'error' ? 'assertive' : 'polite'"
          aria-atomic="true"
          data-testid="toast"
          (mouseenter)="toastService.pause(toast.id)"
          (mouseleave)="toastService.resume(toast.id)"
          (focusin)="toastService.pause(toast.id)"
          (focusout)="toastService.resume(toast.id)"
        >
          <span class="toast-icon" aria-hidden="true"><app-icon [name]="getIcon(toast.type)" [size]="18" /></span>
          <div class="toast-body">
            @if (toast.title) { <strong class="toast-title">{{ toast.title }}</strong> }
            <span class="toast-message">{{ toast.message }}</span>
          </div>
          <button type="button" class="toast-close" (click)="toastService.remove(toast.id)" [attr.aria-label]="'common.close' | t">
            <app-icon name="x" [size]="16" />
          </button>
        </div>
      }
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
      gap: 10px;
      width: min(400px, calc(100vw - 40px));
      pointer-events: none;
    }

    .toast-item {
      --toast-accent: var(--color-info);
      --toast-soft: var(--color-info-soft);
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 12px 12px 14px;
      border-radius: 12px;
      background: #fff;
      border: 1px solid var(--color-border);
      box-shadow: 0 10px 28px rgba(43, 43, 43, 0.14), 0 2px 6px rgba(43, 43, 43, 0.08);
      position: relative;
      overflow: hidden;
      animation: toast-in 0.22s ease-out;
    }

    .toast-item::before {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: 4px;
      background: var(--toast-accent);
    }

    .toast-success { --toast-accent: var(--color-success); --toast-soft: var(--color-success-soft); }
    .toast-error { --toast-accent: var(--color-danger); --toast-soft: var(--color-danger-soft); }
    .toast-warning { --toast-accent: var(--color-warning); --toast-soft: var(--color-warning-soft); }
    .toast-info { --toast-accent: var(--color-info); --toast-soft: var(--color-info-soft); }

    .toast-icon {
      flex-shrink: 0;
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--toast-soft);
      color: var(--toast-accent);
    }

    .toast-warning .toast-icon { color: var(--color-text); }

    .toast-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-top: 4px;
    }

    .toast-title {
      font-size: 14px;
      line-height: 1.3;
      color: var(--color-text);
    }

    .toast-message {
      font-size: 14px;
      line-height: 1.45;
      color: var(--color-text);
      overflow-wrap: anywhere;
    }

    .toast-title + .toast-message { color: var(--color-text-light); }

    .toast-close {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      color: var(--color-text-light);
      transition: background-color 0.15s ease, color 0.15s ease;
    }

    .toast-close:hover { background-color: var(--color-bg-dark); color: var(--color-text); }
    .toast-close:focus-visible { outline: 2px solid var(--color-info); outline-offset: 1px; }

    @keyframes toast-in {
      from { transform: translateX(24px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @keyframes toast-out {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(24px); opacity: 0; }
    }

    .toast-leave { animation: toast-out 0.18s ease-in forwards; }

    @media (max-width: 768px) {
      .toast-container {
        top: auto;
        right: auto;
        left: 50%;
        transform: translateX(-50%);
        bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        width: min(480px, calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
        flex-direction: column-reverse;
      }

      @keyframes toast-in {
        from { transform: translateY(16px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      @keyframes toast-out {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(16px); opacity: 0; }
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .toast-item, .toast-leave { animation: none; }
      .toast-close { transition: none; }
    }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);

  getIcon(type: ToastType): string {
    const icons: Record<ToastType, string> = {
      success: 'circle-check',
      error: 'alert-triangle',
      warning: 'alert-triangle',
      info: 'info'
    };
    return icons[type] || 'info';
  }
}
