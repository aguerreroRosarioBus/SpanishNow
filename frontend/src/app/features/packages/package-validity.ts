import { I18nService } from '../../core/i18n/i18n.service';

export function formatPackageValidity(i18n: I18nService, hours: number): string {
  return hours > 0 && hours % 24 === 0
    ? i18n.t('packages.ui.validityDays', { count: hours / 24 })
    : i18n.t('packages.ui.validityHours', { count: hours });
}
