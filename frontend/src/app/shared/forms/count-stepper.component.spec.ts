import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CountStepperComponent } from './count-stepper.component';

@Component({
  imports: [CountStepperComponent],
  template: `<app-count-stepper [(value)]="guests" [max]="3" />`,
})
class HostComponent {
  readonly guests = signal<number | null>(null);
}

describe('CountStepperComponent (decisión 293)', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const [minus, plus] = Array.from(el.querySelectorAll('button')) as HTMLButtonElement[];
    const tap = (b: HTMLButtonElement) => {
      b.click();
      fixture.detectChanges();
    };
    return { fixture, el, minus, plus, tap };
  }

  it('vacío muestra un guion; + empieza en 2 y no pasa del máximo', () => {
    const { fixture, el, plus, tap } = setup();
    expect(el.querySelector('output')?.textContent?.trim()).toBe('—');
    tap(plus);
    expect(fixture.componentInstance.guests()).toBe(2);
    tap(plus);
    expect(fixture.componentInstance.guests()).toBe(3);
    expect(plus.disabled).toBeTrue();
    expect(el.querySelector('output')?.textContent?.trim()).toBe('3');
  });

  it('− no baja de 1 y los botones dicen qué hacen', () => {
    const { fixture, minus, tap } = setup();
    tap(minus);
    expect(fixture.componentInstance.guests()).toBe(1);
    expect(minus.disabled).toBeTrue();
    expect(minus.getAttribute('aria-label')).toBe('Menos personas');
  });
});
