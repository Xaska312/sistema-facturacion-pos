import { TestBed } from '@angular/core/testing';
import { Confirmation, ConfirmationService } from 'primeng/api';
import { ConfirmService } from './confirm';

describe('ConfirmService', () => {
  let confirmation: jasmine.SpyObj<ConfirmationService>;

  beforeEach(() => {
    confirmation = jasmine.createSpyObj<ConfirmationService>('ConfirmationService', ['confirm']);
    TestBed.configureTestingModule({ providers: [{ provide: ConfirmationService, useValue: confirmation }] });
  });

  function lastConfirmation(): Confirmation {
    return confirmation.confirm.calls.mostRecent().args[0];
  }

  it('usa un verbo claro, "Cancelar" y foco en cancelar', () => {
    const accept = jasmine.createSpy('accept');
    TestBed.inject(ConfirmService).ask({ header: 'Anular venta', message: '¿Anular POS-1?', acceptLabel: 'Anular venta',
      danger: true, accept });
    const options = lastConfirmation();
    expect(options.acceptLabel).toBe('Anular venta');
    expect(options.rejectLabel).toBe('Cancelar');
    expect(options.defaultFocus).toBe('reject');
    expect(options.icon).toContain('exclamation');
    options.accept?.();
    expect(accept).toHaveBeenCalled();
  });

  it('activar/desactivar con la consecuencia solo al desactivar', () => {
    const service = TestBed.inject(ConfirmService);
    service.toggleActive({ active: true, noun: 'sucursal', name: 'Norte', consequence: 'No se podrá vender ahí.',
      accept: () => undefined });
    expect(lastConfirmation().acceptLabel).toBe('Desactivar sucursal');
    expect(lastConfirmation().message).toBe('¿Desactivar Norte? No se podrá vender ahí.');

    service.toggleActive({ active: false, noun: 'sucursal', name: 'Norte', consequence: 'No se podrá vender ahí.',
      accept: () => undefined });
    expect(lastConfirmation().header).toBe('Activar sucursal');
    expect(lastConfirmation().message).toBe('¿Activar Norte?');
  });
});
