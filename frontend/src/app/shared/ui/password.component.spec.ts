import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PasswordComponent, passwordStrength } from './password.component';

@Component({
  imports: [PasswordComponent, ReactiveFormsModule],
  template: `
    <app-password id="pw" [formControl]="control" [toggleMask]="true" autocomplete="new-password"
                  promptLabel="Mínimo 10 caracteres" styleClass="w-full" inputStyleClass="w-full" />
  `,
})
class PasswordHostComponent {
  readonly control = new FormControl('');
}

describe('PasswordComponent', () => {
  let fixture: ComponentFixture<PasswordHostComponent>;
  const input = (): HTMLInputElement => (fixture.nativeElement as HTMLElement).querySelector('#pw input')!;
  const meterText = (): string | null => document.querySelector('.ui-password-meter-text')?.textContent?.trim() ?? null;

  beforeEach(() => {
    fixture = TestBed.createComponent(PasswordHostComponent);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    input().dispatchEvent(new Event('blur'));
    (fixture.nativeElement as HTMLElement).remove();
  });

  it('mide la seguridad con las reglas de antes', () => {
    expect(passwordStrength('')).toBeNull();
    expect(passwordStrength('abcdef')).toBe('weak');
    expect(passwordStrength('abcdef12')).toBe('medium');
    expect(passwordStrength('abcdef12XY')).toBe('strong');
  });

  it('se conecta con el formulario y el ojo muestra la contraseña', () => {
    fixture.componentInstance.control.setValue('secreta');
    fixture.detectChanges();
    expect(input().value).toBe('secreta');
    expect(input().type).toBe('password');
    input().value = 'otra';
    input().dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.control.value).toBe('otra');
    const eye = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[aria-label="Mostrar contraseña"]')!;
    eye.click();
    fixture.detectChanges();
    expect(input().type).toBe('text');
    expect(eye.getAttribute('aria-pressed')).toBe('true');
  });

  it('al enfocar muestra el medidor con la indicación y luego el nivel', () => {
    input().dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(meterText()).toBe('Mínimo 10 caracteres');
    input().value = 'abcdef12XY';
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(meterText()).toBe('Fuerte');
    input().dispatchEvent(new Event('blur'));
    expect(meterText()).toBeNull();
  });
});
