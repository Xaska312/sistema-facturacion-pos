import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SideTipDirective } from './side-tip.directive';

@Component({
  imports: [SideTipDirective],
  template: `<button type="button" appSideTip="Proveedores" [sideTipDisabled]="disabled()">P</button>`,
})
class HostComponent {
  readonly disabled = signal(false);
}

describe('SideTipDirective', () => {
  afterEach(() => document.querySelectorAll('.side-tip').forEach((e) => e.remove()));

  it('muestra el nombre a la derecha al pasar el mouse y lo quita al salir', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
    button.dispatchEvent(new MouseEvent('mouseenter'));
    const tip = document.querySelector('.side-tip') as HTMLElement;
    expect(tip.textContent).toBe('Proveedores');
    expect(parseInt(tip.style.left, 10)).toBeGreaterThanOrEqual(Math.round(button.getBoundingClientRect().right));
    button.dispatchEvent(new MouseEvent('mouseleave'));
    expect(document.querySelector('.side-tip')).toBeNull();
  });

  it('no aparece con el menú expandido', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector('button')?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.querySelector('.side-tip')).toBeNull();
  });
});
