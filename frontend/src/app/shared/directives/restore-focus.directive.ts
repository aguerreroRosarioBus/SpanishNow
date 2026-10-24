import { DOCUMENT } from '@angular/common';
import { DestroyRef, Directive, inject } from '@angular/core';

/** Al cerrar un overlay devuelve el foco a la acción que lo abrió, si todavía existe. */
@Directive({ selector: '[appRestoreFocus]', standalone: true })
export class RestoreFocusDirective {
  private readonly opener = inject(DOCUMENT).activeElement as HTMLElement | null;
  constructor() {
    inject(DestroyRef).onDestroy(() => queueMicrotask(() => {
      if (this.opener?.isConnected && !this.opener.hasAttribute('disabled')) this.opener.focus();
    }));
  }
}
