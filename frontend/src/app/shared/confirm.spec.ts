import { TestBed } from '@angular/core/testing';
import { ConfirmService } from './confirm';

describe('ConfirmService', () => {
  let service: ConfirmService;

  beforeEach(() => {
    service = TestBed.inject(ConfirmService);
  });

  it('usa un verbo claro, "Cancelar" e ícono de advertencia si es destructiva', () => {
    const accept = jasmine.createSpy('accept');
    service.ask({ header: 'Anular venta', message: '¿Anular POS-1?', acceptLabel: 'Anular venta', danger: true, accept });
    const request = service.request()!;
    expect(request.acceptLabel).toBe('Anular venta');
    expect(request.rejectLabel).toBe('Cancelar');
    expect(request.danger).toBeTrue();
    expect(request.icon).toContain('exclamation');
    service.accept();
    expect(accept).toHaveBeenCalled();
    expect(service.request()).toBeNull();
  });

  it('cancelar cierra y avisa a reject, sin confirmar', () => {
    const accept = jasmine.createSpy('accept');
    const reject = jasmine.createSpy('reject');
    service.ask({ header: 'Salir', message: '¿Salir?', acceptLabel: 'Salir', accept, reject });
    expect(service.request()!.icon).toContain('question');
    service.reject();
    expect(reject).toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
    expect(service.request()).toBeNull();
  });

  it('activar/desactivar con la consecuencia solo al desactivar', () => {
    service.toggleActive({ active: true, noun: 'sucursal', name: 'Norte', consequence: 'No se podrá vender ahí.',
      accept: () => undefined });
    expect(service.request()!.acceptLabel).toBe('Desactivar sucursal');
    expect(service.request()!.message).toBe('¿Desactivar Norte? No se podrá vender ahí.');

    service.toggleActive({ active: false, noun: 'sucursal', name: 'Norte', consequence: 'No se podrá vender ahí.',
      accept: () => undefined });
    expect(service.request()!.header).toBe('Activar sucursal');
    expect(service.request()!.message).toBe('¿Activar Norte?');
  });
});
