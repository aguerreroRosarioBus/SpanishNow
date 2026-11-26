import { TestBed } from '@angular/core/testing';
import { I18nService } from '../i18n/i18n.service';
import { ToastService } from './toast.service';

describe('ToastService sin conexión', () => {
  it('muestra un solo aviso de error cuando se corta la conexión, en cualquier orden', () => {
    const toast = TestBed.inject(ToastService);
    const network = TestBed.inject(I18nService).t('errors.network');

    toast.error('No pudimos cargar los trámites.');
    toast.error(network);
    toast.error('No pudimos cargar los pagos.');
    toast.error(network);

    expect(toast.getToasts().map(t => t.message)).toEqual([network]);
  });

  it('sin falla de red no descarta errores distintos ni avisos de otro tipo', () => {
    const toast = TestBed.inject(ToastService);
    toast.error('Uno');
    toast.error('Dos');
    toast.success('Listo');
    expect(toast.getToasts().map(t => t.message)).toEqual(['Uno', 'Dos', 'Listo']);
  });
});
