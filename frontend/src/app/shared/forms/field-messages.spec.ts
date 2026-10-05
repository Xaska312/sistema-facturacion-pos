import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FieldErrorComponent } from './field-error.component';
import { applyServerErrors, controlErrorMessage } from './field-messages';

describe('controlErrorMessage', () => {
  it('traduce los validadores comunes', () => {
    expect(controlErrorMessage(null)).toBeNull();
    expect(controlErrorMessage({ required: true })).toBe('Este campo es obligatorio.');
    expect(controlErrorMessage({ maxlength: { requiredLength: 120, actualLength: 130 } })).toBe('Máximo 120 caracteres.');
    expect(controlErrorMessage({ pattern: {} }, 'Solo letras y números.')).toBe('Solo letras y números.');
    expect(controlErrorMessage({ server: 'Ya existe.' })).toBe('Ya existe.');
  });
});

describe('applyServerErrors', () => {
  it('marca los campos del servidor y devuelve los que no existen en el formulario', () => {
    const form = new FormGroup({ code: new FormControl('NORTE'), name: new FormControl('Norte') });
    const unmatched = applyServerErrors(form, [
      { field: 'code', message: 'ya existe' },
      { field: 'cityCode', message: 'no existe' },
    ]);
    expect(form.controls.code.errors).toEqual({ server: 'Ya existe.' });
    expect(form.controls.code.touched).toBeTrue();
    expect(unmatched).toEqual([{ field: 'cityCode', message: 'no existe' }]);

    form.controls.code.setValue('SUR');
    expect(form.controls.code.errors).toBeNull();
  });

  it('sin formulario devuelve todos', () => {
    expect(applyServerErrors(null, [{ field: 'name', message: 'x' }]).length).toBe(1);
  });
});

describe('FieldErrorComponent', () => {
  it('muestra el error solo cuando el campo se tocó', () => {
    TestBed.configureTestingModule({ imports: [FieldErrorComponent] });
    const control = new FormControl('', Validators.required);
    const fixture = TestBed.createComponent(FieldErrorComponent);
    fixture.componentRef.setInput('control', control);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent?.trim()).toBe('');

    control.markAsTouched();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Este campo es obligatorio.');
  });
});
