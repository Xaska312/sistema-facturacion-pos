import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CashApi, OptionalPaymentMethod } from '../../core/api/cash.api';
import { ToastService } from '../../shared/ui/toast.service';
import { PAYMENT_SUGGESTIONS, PaymentMethodsSectionComponent } from './payment-methods-section.component';

describe('Otros medios de pago (decisiones 366 y 367)', () => {
  const addi: OptionalPaymentMethod = { id: 'a', code: 'ADDI', name: 'Addi', active: false, requiresReference: true, custom: false };
  const siste: OptionalPaymentMethod = { id: 's', code: 'SISTECREDITO', name: 'Sistecrédito', active: false, requiresReference: true, custom: false };
  const supay: OptionalPaymentMethod = { id: 'p', code: 'OTRO_1A2B3C4D', name: 'SU+ Pay', active: true, requiresReference: true, custom: true };

  function setup() {
    const api = jasmine.createSpyObj<CashApi>('CashApi', ['optionalPaymentMethods', 'updatePaymentMethod', 'createPaymentMethod']);
    api.optionalPaymentMethods.and.returnValue(of([addi, siste]));
    api.updatePaymentMethod.and.returnValue(of([{ ...addi, active: true }, siste]));
    api.createPaymentMethod.and.returnValue(of([addi, siste, supay]));
    TestBed.configureTestingModule({
      imports: [PaymentMethodsSectionComponent],
      providers: [{ provide: CashApi, useValue: api }, { provide: ToastService, useValue: { add: () => undefined } }],
    });
    const fixture = TestBed.createComponent(PaymentMethodsSectionComponent);
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
    return { api, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('prende Addi al marcarlo', () => {
    const { api, fixture, el } = setup();
    expect(el.textContent).toContain('Sistecrédito');
    const box = el.querySelector<HTMLInputElement>('li input[type=checkbox]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.updatePaymentMethod).toHaveBeenCalledWith('a', { active: true });
  });

  it('agrega un medio propio desde una sugerencia', async () => {
    const { api, fixture, el } = setup();
    const chip = [...el.querySelectorAll<HTMLButtonElement>('.pm-chip')].find((b) => b.textContent?.trim() === 'SU+ Pay')!;
    chip.click();
    fixture.detectChanges();
    await fixture.whenStable();
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.createPaymentMethod).toHaveBeenCalledWith('SU+ Pay', true);
    expect(el.textContent).toContain('Pide referencia');
    // La sugerencia que ya está en la lista no se vuelve a ofrecer.
    expect([...el.querySelectorAll('.pm-chip')].map((b) => b.textContent?.trim())).not.toContain('SU+ Pay');
    expect(PAYMENT_SUGGESTIONS).toContain('SU+ Pay');
  });
});
