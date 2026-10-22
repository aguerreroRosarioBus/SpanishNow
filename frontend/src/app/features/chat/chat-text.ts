import { DOCUMENT } from '@angular/common';
import { Injectable, Pipe, PipeTransform, inject } from '@angular/core';
import { CHAT_I18N, ChatLocale } from './chat.i18n';

type Params = Readonly<Record<string, string | number>>;

/**
 * Traducción local del chat mientras W01 (I18N) no esté en main. Lee el idioma que guarda W01 (solo lectura, misma
 * clave) y cae a español, el idioma actual de la app. Al integrar W01: borrar este archivo, registrar CHAT_I18N en
 * I18N_CATALOGS y cambiar `chatT` por `t` en las plantillas.
 */
@Injectable({ providedIn: 'root' })
export class ChatText {
  private document = inject(DOCUMENT);

  get locale(): ChatLocale {
    try {
      return this.document.defaultView?.localStorage.getItem('spanishnow.locale') === 'en' ? 'en' : 'es';
    } catch {
      return 'es';
    }
  }

  get intlLocale(): string { return this.locale === 'es' ? 'es-AR' : 'en-US'; }

  t(key: string, params: Params = {}): string {
    const message = CHAT_I18N[this.locale][key] ?? CHAT_I18N.es[key];
    if (message === undefined) return `[${key}]`;
    let template: string;
    if (typeof message === 'string') template = message;
    else {
      const count = Number(params['count']);
      const exact = message[`=${count}` as `=${number}`];
      const rule = new Intl.PluralRules(this.intlLocale).select(count);
      template = exact ?? (rule === 'one' && message.one ? message.one : message.other);
    }
    return template.replace(/\{([a-zA-Z]\w*)\}/g, (token, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : token));
  }

  /** Texto para un error de la API por su `code` estable (CONTRATO.md §1.5). */
  error(error: unknown): string {
    const res = error as { status?: number; error?: { code?: string; params?: Record<string, unknown> } } | null;
    if (res?.status === 0) return this.t('chat.errors.network');
    const code = res?.error?.code;
    const params = res?.error?.params ?? {};
    if (code === 'rate_limited' && typeof params['retryAt'] === 'string') {
      const time = new Intl.DateTimeFormat(this.intlLocale, { hour: '2-digit', minute: '2-digit' }).format(new Date(params['retryAt']));
      return this.t('chat.errors.rate_limited', { time });
    }
    if (code === 'message_too_long') return this.t('chat.errors.message_too_long', { max: Number(params['max']) || 2000 });
    if (code && Object.hasOwn(CHAT_I18N.es, `chat.errors.${code}`)) return this.t(`chat.errors.${code}`);
    return this.t('chat.errors.unexpected');
  }
}

@Pipe({ name: 'chatT', standalone: true, pure: false })
export class ChatTextPipe implements PipeTransform {
  private text = inject(ChatText);
  transform(key: string, params?: Params): string { return this.text.t(key, params); }
}
