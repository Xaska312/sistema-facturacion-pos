import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { CashSession, RegisterOption } from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { AuthService } from '../../core/auth/auth.service';
import { OpenCashComponent } from './open-cash.component';

const register = (id: string, over: Partial<RegisterOption> = {}): RegisterOption =>
  ({ id, code: id.toUpperCase(), name: 'Caja principal', branchId: 'b1', branchName: 'Principal', busy: false, busyBy: null, ...over });

describe('OpenCashComponent', () => {
  let cash: jasmine.SpyObj<CashApi>;
  let allowed: boolean;

  beforeEach(() => {
    allowed = true;
    cash = jasmine.createSpyObj<CashApi>('CashApi', ['registers', 'open']);
    cash.open.and.returnValue(of({ id: 's1' } as CashSession));
    TestBed.configureTestingModule({
      imports: [OpenCashComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: CashApi, useValue: cash },
        { provide: AuthService, useValue: { hasPermission: () => allowed } },
        { provide: MessageService, useValue: jasmine.createSpyObj<MessageService>('MessageService', ['add']) },
      ],
    });
  });

  const render = async () => {
    const fixture = TestBed.createComponent(OpenCashComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  it('con una sola caja libre basta con la base de efectivo y "Abrir caja"', async () => {
    cash.registers.and.returnValue(of([register('caja-1')]));
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const opened: CashSession[] = [];
    fixture.componentInstance.opened.subscribe((s) => opened.push(s));

    expect(element.textContent).toContain('CAJA-1 · Caja principal');
    const amount = element.querySelector('#opening-amount') as HTMLInputElement;
    expect(element.querySelector('label[for="opening-amount"]')?.textContent).toContain('Base de efectivo');
    amount.value = '50000';
    amount.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(cash.open).toHaveBeenCalledWith('caja-1', 50000, null);
    expect(opened.length).toBe(1);
  });

  it('con varias cajas libres hay que elegir una (las ocupadas no se pueden)', async () => {
    cash.registers.and.returnValue(of([
      register('caja-1'),
      register('caja-2'),
      register('caja-3', { busy: true, busyBy: 'Ana' }),
    ]));
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const options = Array.from(element.querySelectorAll<HTMLButtonElement>('button.register'));
    expect(options.length).toBe(3);
    expect(options[2].disabled).toBeTrue();
    expect(element.textContent).toContain('Abierta por Ana');

    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(cash.open).not.toHaveBeenCalled();

    options[1].click();
    fixture.detectChanges();
    expect(options[1].getAttribute('aria-pressed')).toBe('true');
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(cash.open).toHaveBeenCalledWith('caja-2', 0, null);
  });

  it('si solo una caja está libre, queda elegida', async () => {
    cash.registers.and.returnValue(of([register('caja-1'), register('caja-2', { busy: true, busyBy: 'Ana' })]));
    const fixture = await render();
    const options = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.register'));
    expect(options[0].getAttribute('aria-pressed')).toBe('true');
    expect(options[1].disabled).toBeTrue();
  });

  it('sin permiso de caja explica qué pedir y no consulta cajas', async () => {
    allowed = false;
    const fixture = await render();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Tu usuario no puede abrir cajas');
    expect(cash.registers).not.toHaveBeenCalled();
  });
});
