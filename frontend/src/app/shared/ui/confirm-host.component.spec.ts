import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmService } from '../confirm';
import { ConfirmHostComponent } from './confirm-host.component';

describe('ConfirmHostComponent', () => {
  let fixture: ComponentFixture<ConfirmHostComponent>;
  let confirm: ConfirmService;
  const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="alertdialog"]');
  const buttons = (): HTMLButtonElement[] => [...dialog()!.querySelectorAll<HTMLButtonElement>('.ui-dialog-footer button')];

  beforeEach(() => {
    fixture = TestBed.createComponent(ConfirmHostComponent);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    confirm = TestBed.inject(ConfirmService);
    fixture.detectChanges();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  it('pinta la confirmación con foco en Cancelar y el botón rojo si es destructiva', () => {
    const accept = jasmine.createSpy('accept');
    confirm.ask({ header: 'Desactivar producto', message: '¿Desactivar Gaseosa?', acceptLabel: 'Desactivar',
      danger: true, accept });
    fixture.detectChanges();
    expect(dialog()!.textContent).toContain('Desactivar producto');
    expect(dialog()!.textContent).toContain('¿Desactivar Gaseosa?');
    expect(dialog()!.querySelector('.pi-exclamation-triangle')).not.toBeNull();
    const [reject, acceptButton] = buttons();
    expect(reject.textContent!.trim()).toBe('Cancelar');
    expect(document.activeElement).toBe(reject);
    expect(acceptButton.classList).toContain('ui-button-danger');
    acceptButton.click();
    fixture.detectChanges();
    expect(accept).toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it('Escape cancela sin confirmar', () => {
    const accept = jasmine.createSpy('accept');
    const reject = jasmine.createSpy('reject');
    confirm.ask({ header: 'Salir', message: '¿Salir?', acceptLabel: 'Salir', accept, reject });
    fixture.detectChanges();
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(reject).toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });
});
