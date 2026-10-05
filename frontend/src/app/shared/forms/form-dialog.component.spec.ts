import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { Observable, Subject, throwError } from 'rxjs';
import { ConfirmService } from '../confirm';
import { FieldErrorComponent } from './field-error.component';
import { FormDialogComponent } from './form-dialog.component';

@Component({
  imports: [FormDialogComponent, ReactiveFormsModule, FieldErrorComponent],
  template: `
    <app-form-dialog [(visible)]="open" header="Nueva sucursal" [form]="form" [save]="save"
                     successMessage="Sucursal guardada" (saved)="savedCount = savedCount + 1">
      <div [formGroup]="form">
        <label for="code">Código</label>
        <input id="code" formControlName="code" />
        <app-field-error [control]="form.controls.code" />
      </div>
    </app-form-dialog>
  `,
})
class HostComponent {
  open = true;
  savedCount = 0;
  calls = 0;
  response: () => Observable<unknown> = () => new Subject<unknown>();
  readonly form = new FormGroup({ code: new FormControl('', { nonNullable: true, validators: Validators.required }) });
  readonly save = (): Observable<unknown> => {
    this.calls++;
    return this.response();
  };
}

describe('FormDialogComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let confirm: jasmine.SpyObj<ConfirmService>;
  let messages: jasmine.SpyObj<MessageService>;

  beforeEach(() => {
    confirm = jasmine.createSpyObj<ConfirmService>('ConfirmService', ['ask']);
    messages = jasmine.createSpyObj<MessageService>('MessageService', ['add']);
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ConfirmService, useValue: confirm },
        { provide: MessageService, useValue: messages },
      ],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  // p-dialog anima al cerrarse: se espera a que termine antes de destruir el módulo de pruebas. Si no, el
  // callback de la animación corre con el inyector ya destruido (NG0205) y falla otra prueba al azar.
  afterEach(async () => {
    host.open = false;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const formElement = (): HTMLFormElement => element().querySelector('form') as HTMLFormElement;
  const submit = (): void => {
    formElement().dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  };

  it('no guarda si el formulario es inválido y marca los campos', () => {
    submit();
    expect(host.calls).toBe(0);
    expect(element().textContent).toContain('Revisa los campos marcados.');
    expect(element().textContent).toContain('Este campo es obligatorio.');
  });

  it('evita el doble envío y cierra al guardar', () => {
    const response = new Subject<unknown>();
    host.response = () => response;
    host.form.controls.code.setValue('NORTE');
    submit();
    submit();
    expect(host.calls).toBe(1);

    response.next({ id: '1' });
    response.complete();
    fixture.detectChanges();
    expect(host.open).toBeFalse();
    expect(host.savedCount).toBe(1);
    expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Sucursal guardada' }));
  });

  it('muestra los errores del servidor junto al campo', fakeAsync(() => {
    host.response = () =>
      throwError(() => new HttpErrorResponse({ status: 400, error: { errors: [{ field: 'code', message: 'ya existe' }] } }));
    host.form.controls.code.setValue('NORTE');
    submit();
    tick();
    fixture.detectChanges();
    expect(host.open).toBeTrue();
    expect(element().textContent).toContain('Ya existe.');
  }));

  it('pide confirmación al cerrar con cambios sin guardar', () => {
    host.form.controls.code.setValue('NORTE');
    host.form.markAsDirty();
    const dialog = fixture.debugElement.query(By.directive(FormDialogComponent)).componentInstance as FormDialogComponent;
    dialog.requestClose();
    expect(confirm.ask).toHaveBeenCalled();
    expect(host.open).toBeTrue();

    host.form.markAsPristine();
    dialog.requestClose();
    fixture.detectChanges();
    expect(host.open).toBeFalse();
  });
});
