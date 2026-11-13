import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ToastHostComponent } from './toast-host.component';
import { ToastService } from './toast.service';

describe('ToastHostComponent y ToastService', () => {
  let fixture: ComponentFixture<ToastHostComponent>;
  let toasts: ToastService;
  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const items = (): HTMLElement[] => [...root().querySelectorAll<HTMLElement>('.ui-toast-message')];

  beforeEach(() => {
    fixture = TestBed.createComponent(ToastHostComponent);
    toasts = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it('pinta el aviso con su severidad, título, detalle y se anuncia', () => {
    toasts.add({ severity: 'success', summary: 'Venta registrada', detail: 'POS-1042' });
    fixture.detectChanges();
    const [toast] = items();
    expect(toast.classList).toContain('ui-toast-message-success');
    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.querySelector('.ui-toast-summary')!.textContent).toContain('Venta registrada');
    expect(toast.querySelector('.ui-toast-detail')!.textContent).toContain('POS-1042');
  });

  it('se cierra solo a los 3 s (o en su life) y con la X', fakeAsync(() => {
    toasts.add({ severity: 'info', summary: 'Corto' });
    toasts.add({ severity: 'warn', summary: 'Largo', life: 8000 });
    fixture.detectChanges();
    expect(items().length).toBe(2);
    tick(3000);
    fixture.detectChanges();
    expect(items().length).toBe(1);
    items()[0].querySelector<HTMLButtonElement>('[aria-label="Cerrar"]')!.click();
    fixture.detectChanges();
    expect(items().length).toBe(0);
    tick(8000);
  }));

  it('espera mientras el mouse está encima', fakeAsync(() => {
    toasts.add({ summary: 'Sin severidad' });
    fixture.detectChanges();
    const toast = items()[0];
    expect(toast.classList).toContain('ui-toast-message-info');
    toast.dispatchEvent(new MouseEvent('mouseenter'));
    tick(5000);
    fixture.detectChanges();
    expect(items().length).toBe(1);
    toast.dispatchEvent(new MouseEvent('mouseleave'));
    tick(3000);
    fixture.detectChanges();
    expect(items().length).toBe(0);
  }));

  it('clear quita todos', () => {
    toasts.add({ summary: 'A' });
    toasts.add({ summary: 'B', sticky: true });
    toasts.clear();
    fixture.detectChanges();
    expect(items().length).toBe(0);
  });
});
