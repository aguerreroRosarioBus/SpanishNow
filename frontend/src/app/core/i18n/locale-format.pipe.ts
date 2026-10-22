import { inject, Pipe, PipeTransform } from '@angular/core';
import { I18nService } from './i18n.service';

@Pipe({ name: 'localeNumber', standalone: true, pure: false })
export class LocaleNumberPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(value: number, options?: Intl.NumberFormatOptions): string { return this.i18n.formatNumber(value, options); }
}

@Pipe({ name: 'localeMoney', standalone: true, pure: false })
export class LocaleMoneyPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(amount: number, currency: string): string { return this.i18n.formatMoney(amount, currency); }
}

@Pipe({ name: 'localeDate', standalone: true, pure: false })
export class LocaleDatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(instant: string | number | Date, timeZone: string, options?: Intl.DateTimeFormatOptions): string {
    return this.i18n.formatInstant(instant, timeZone, options);
  }
}
