import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { formatPesosInput, parsePesos } from './pesos-input';
import { PesosInputDirective } from './pesos-input.directive';

describe('montos en pesos (QA DIN-1)', () => {
  it('lee los montos como se escriben en Colombia', () => {
    expect(parsePesos('250.000')).toBe(250000);
    expect(parsePesos('$ 1.500')).toBe(1500);
    expect(parsePesos('1.234.567')).toBe(1234567);
    expect(parsePesos('1500')).toBe(1500);
    expect(parsePesos(' 20 000 ')).toBe(20000);
    expect(parsePesos('1.234,56', 2)).toBe(1234.56);
    expect(parsePesos('12.5', 2)).toBe(12.5); // punto del teclado numérico
    expect(parsePesos('1.500,50')).toBe(1501); // sin centavos: se redondea
  });

  it('rechaza lo que no es un monto', () => {
    expect(parsePesos('')).toBeNull();
    expect(parsePesos(null)).toBeNull();
    expect(parsePesos('abc')).toBeNull();
    expect(parsePesos('-500')).toBeNull();
    expect(parsePesos('1,2,3')).toBeNull();
  });

  it('muestra los puntos de miles', () => {
    expect(formatPesosInput(250000)).toBe('250.000');
    expect(formatPesosInput(1234.5, 2)).toBe('1.234,5');
    expect(formatPesosInput(null)).toBe('');
  });
});

@Component({
  imports: [FormsModule, PesosInputDirective],
  template: `<input appPesos [(ngModel)]="amount" />`,
})
class HostComponent {
  amount: number | null = 10000;
}

describe('PesosInputDirective', () => {
  it('entrega un número y lo formatea al salir del campo', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('10.000');
    expect(input.type).toBe('text');

    input.value = '250.000';
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.amount).toBe(250000);
    input.dispatchEvent(new Event('blur'));
    expect(input.value).toBe('250.000');

    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.amount).toBeNull();
  });
});
