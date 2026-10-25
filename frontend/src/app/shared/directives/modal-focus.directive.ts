import { I18nService } from '../../core/i18n/i18n.service';
import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, afterRenderEffect, booleanAttribute, inject, input, output, DestroyRef } from '@angular/core';

/** Contrato de teclado para ventanas manuales: entrada, contención y retorno del foco. */
@Directive({ selector: '[appModalFocus]', standalone: true })
export class ModalFocusDirective {
  readonly enabled = input(true, { alias: 'appModalFocus', transform: booleanAttribute });
  readonly modalDismiss = output<void>();
  private readonly element: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly i18n = inject(I18nService);
  private notice: HTMLElement | null = null;
  private previous: HTMLElement | null = null;
  private active = false;
  private focusables(): HTMLElement[] {
    return Array.from(this.element.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.hidden && !el.closest('[hidden], [inert]') && el.getClientRects().length > 0);
  }
  private keydown = (event: KeyboardEvent): void => {
    if (!this.active) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      const changed = this.element.querySelector('form.ng-dirty') || Array.from(this.element.querySelectorAll<HTMLInputElement>('input[type="file"]')).some(el => !!el.files?.length);
      if (changed) {
        if (!this.notice) {
          this.notice = this.document.createElement('p');
          this.notice.className = 'alert alert-warning';
          this.notice.setAttribute('role', 'alert');
          (this.element.querySelector('.modal-body') ?? this.element).prepend(this.notice);
        }
        this.notice.textContent = this.i18n.t('refine.unsavedEscape');
      } else this.modalDismiss.emit();
    }
    if (event.key !== 'Tab') return;
    const controls = this.focusables();
    const first = controls[0] ?? this.element;
    const last = controls.at(-1) ?? this.element;
    const current = this.document.activeElement;
    if (!this.element.contains(current) || (event.shiftKey ? current === first : current === last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  };
  constructor() {
    afterRenderEffect(() => {
      const warning = this.i18n.t('refine.unsavedEscape');
      if (this.notice && this.notice.textContent !== warning) this.notice.textContent = warning;
      if (this.enabled() && !this.active) {
        this.active = true;
        this.previous = this.document.activeElement as HTMLElement | null;
        this.document.addEventListener('keydown', this.keydown, true);
        (this.element.querySelector<HTMLElement>('[autofocus], input:not([disabled]), textarea:not([disabled])') ?? this.focusables()[0] ?? this.element).focus();
      } else if (!this.enabled()) this.release();
    });
    inject(DestroyRef).onDestroy(() => this.release());
  }
  private release(): void {
    if (!this.active) return;
    this.active = false;
    this.notice?.remove(); this.notice = null;
    this.document.removeEventListener('keydown', this.keydown, true);
    if (this.previous?.isConnected) this.previous.focus();
    this.previous = null;
  }
}
