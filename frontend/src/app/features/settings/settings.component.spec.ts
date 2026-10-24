import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { SettingsComponent } from './settings.component';
import { AuthService } from '../../core/services/auth.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { I18nService } from '../../core/i18n/i18n.service';

it('preferencias: cambiar idioma conserva la zona y exige confirmar cualquier edición', () => {
  const preferences = { preferences: signal({locale: 'es', timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: '2026-10-22T12:00:00Z'}), saving: signal(false), loading: signal(false), errorMessage: signal(''), saveTimeZone: vi.fn() };
  TestBed.configureTestingModule({providers: [
    {provide: AuthService, useValue: {currentUser: signal({name: 'Ejemplo', role: 'teacher'})}},
    {provide: UserPreferencesService, useValue: preferences}
  ]});
  const fixture = TestBed.createComponent(SettingsComponent); fixture.detectChanges();
  const c = fixture.componentInstance;
  c.editZone('America/New_York'); c.zoneConfirmed.set(true);
  c.selectLanguage({target: {value: 'en'}} as unknown as Event); fixture.detectChanges();
  expect(TestBed.inject(I18nService).locale()).toBe('en');
  expect(c.zoneDraft()).toBe('America/New_York'); expect(preferences.saveTimeZone).not.toHaveBeenCalled();
  c.editZone('Europe/Madrid');
  c.saveZone(new Event('submit')); expect(preferences.saveTimeZone).not.toHaveBeenCalled();
  c.zoneConfirmed.set(true); c.saveZone(new Event('submit'));
  expect(preferences.saveTimeZone).toHaveBeenCalledExactlyOnceWith('Europe/Madrid');
  fixture.destroy();
});
