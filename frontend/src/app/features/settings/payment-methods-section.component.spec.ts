import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CashApi, OptionalPaymentMethod } from '../../core/api/cash.api';
import { ToastService } from '../../shared/ui/toast.service';
import { PaymentMethodsSectionComponent } from './payment-methods-section.component';

describe('Otros medios de pago: Addi y Sistecrédito (decisión 366)', () => {
  const addi: OptionalPaymentMethod = { id: 'a', code: 'ADDI', name: 'Addi', active: false };
  const siste: OptionalPaymentMethod = { id: 's', code: 'SISTECREDITO', name: 'Sistecrédito', active: false };

  it('los muestra y prende el que se marca', () => {
    const api = jasmine.createSpyObj<CashApi>('CashApi', ['optionalPaymentMethods', 'setPaymentMethodActive']);
    api.optionalPaymentMethods.and.returnValue(of([addi, siste]));
    api.setPaymentMethodActive.and.returnValue(of([{ ...addi, active: true }, siste]));
    TestBed.configureTestingModule({
      imports: [PaymentMethodsSectionComponent],
      providers: [{ provide: CashApi, useValue: api }, { provide: ToastService, useValue: { add: () => undefined } }],
    });
    const fixture = TestBed.createComponent(PaymentMethodsSectionComponent);
    fixture.componentRef.setInput('canEdit', true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Addi');
    expect(el.textContent).toContain('Sistecrédito');
    const box = el.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(box.disabled).toBeFalse();
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.setPaymentMethodActive).toHaveBeenCalledWith('a', true);
    expect(el.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBeTrue();
  });
});
