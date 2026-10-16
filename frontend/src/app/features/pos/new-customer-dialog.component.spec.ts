import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { Party, PartyInput } from '../../core/api/api.models';
import { PartiesApi } from '../../core/api/parties.api';
import { ConfirmService } from '../../shared/confirm';
import { NewCustomerDialogComponent } from './new-customer-dialog.component';
import { quickCustomerDraft } from './quick-customer';

describe('quickCustomerDraft', () => {
  it('con números llena el documento (sin puntos ni espacios)', () => {
    const draft = quickCustomerDraft(' 1.020.304 050 ');
    expect(draft.documentNumber).toBe('1020304050');
    expect(draft.firstNames).toBe('');
  });

  it('con palabras: la primera es el nombre y el resto los apellidos', () => {
    const draft = quickCustomerDraft('Marta  Gómez Ruiz');
    expect(draft.firstNames).toBe('Marta');
    expect(draft.lastNames).toBe('Gómez Ruiz');
    expect(draft.documentNumber).toBe('');
  });

  it('vacío deja el formulario en blanco', () => {
    expect(quickCustomerDraft('   ').documentType).toBe('CC');
  });
});

describe('NewCustomerDialogComponent', () => {
  let fixture: ComponentFixture<NewCustomerDialogComponent>;
  let api: jasmine.SpyObj<PartiesApi>;

  beforeEach(() => {
    api = jasmine.createSpyObj<PartiesApi>('PartiesApi', ['save']);
    api.save.and.returnValue(of({ id: 'p1', displayName: 'Marta Gómez' } as Party));
    TestBed.configureTestingModule({
      imports: [NewCustomerDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: PartiesApi, useValue: api },
        { provide: ConfirmService, useValue: jasmine.createSpyObj<ConfirmService>('ConfirmService', ['ask']) },
        { provide: MessageService, useValue: jasmine.createSpyObj<MessageService>('MessageService', ['add']) },
      ],
    });
    fixture = TestBed.createComponent(NewCustomerDialogComponent);
  });

  afterEach(async () => {
    fixture.componentInstance.visible.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const type = (id: string, value: string): void => {
    const input = element().querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('abre con lo buscado, guarda como cliente y emite el cliente creado', async () => {
    const created: Party[] = [];
    fixture.componentInstance.created.subscribe((p) => created.push(p));
    fixture.componentInstance.prepare('1020304050');
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((element().querySelector('#qc-number') as HTMLInputElement).value).toBe('1020304050');
    type('qc-first', 'Marta');
    type('qc-last', 'Gómez');
    type('qc-phone', '3001234567');
    fixture.detectChanges();
    element().querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(api.save).toHaveBeenCalledTimes(1);
    const [kind, id, input] = api.save.calls.mostRecent().args as [string, string | null, PartyInput];
    expect(kind).toBe('customers');
    expect(id).toBeNull();
    expect(input.documentNumber).toBe('1020304050');
    expect(input.firstNames).toBe('Marta');
    expect(input.lastNames).toBe('Gómez');
    expect(input.phone).toBe('3001234567');
    expect(created.map((p) => p.id)).toEqual(['p1']);
  });

  it('sin nombre no guarda y dice qué falta', async () => {
    fixture.componentInstance.prepare('1020304050');
    fixture.componentInstance.visible.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    element().querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(api.save).not.toHaveBeenCalled();
    expect(element().textContent).toContain('Escribe nombres y apellidos.');
  });
});
