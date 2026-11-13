import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DrawerComponent } from './drawer.component';
import { PopoverComponent } from './popover.component';
import { TooltipDirective } from './tooltip.directive';

@Component({
  imports: [DrawerComponent, PopoverComponent, TooltipDirective],
  template: `
    <app-drawer [visible]="open()" (visibleChange)="open.set($event)" header="Ayuda: Vender">
      <p id="help">Contenido</p>
    </app-drawer>
    <button id="tip" type="button" appTooltip="Planes y pagos" tooltipPosition="bottom">Planes</button>
    <button id="pop" type="button" (click)="pop.toggle($event)">Costo</button>
    <app-popover #pop ariaLabel="Ayuda del costo" (shown)="shown = shown + 1" (hidden)="hidden = hidden + 1">
      <p id="pop-text">Lo que cuesta cada unidad</p>
    </app-popover>
  `,
})
class OverlayHostComponent {
  readonly open = signal(false);
  shown = 0;
  hidden = 0;
}

describe('DrawerComponent, PopoverComponent y TooltipDirective', () => {
  let fixture: ComponentFixture<OverlayHostComponent>;
  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(OverlayHostComponent);
    document.body.appendChild(root());
    fixture.detectChanges();
  });

  afterEach(() => root().remove());

  it('el panel lateral se abre con título y contenido; Escape y el fondo lo cierran', () => {
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    expect(root().querySelector('.ui-drawer-title')!.textContent).toContain('Ayuda: Vender');
    expect(root().querySelector('#help')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(root().querySelector('.ui-drawer')).toBeNull();

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    root().querySelector<HTMLElement>('.ui-drawer-mask')!.click();
    fixture.detectChanges();
    expect(root().querySelector('.ui-drawer')).toBeNull();
  });

  it('el tooltip aparece al pasar el mouse y se va al salir', () => {
    const button = root().querySelector<HTMLElement>('#tip')!;
    button.dispatchEvent(new MouseEvent('mouseenter'));
    const tip = document.querySelector<HTMLElement>('.ui-tooltip')!;
    expect(tip.textContent).toBe('Planes y pagos');
    expect(tip.classList).toContain('ui-tooltip-bottom');
    button.dispatchEvent(new MouseEvent('mouseleave'));
    expect(document.querySelector('.ui-tooltip')).toBeNull();
  });

  it('el popover se abre sobre <body>, avisa y se cierra con Escape devolviendo el foco', () => {
    const button = root().querySelector<HTMLButtonElement>('#pop')!;
    button.focus();
    button.click();
    fixture.detectChanges();
    const popover = document.querySelector<HTMLElement>('.ui-popover')!;
    expect(popover.parentElement).toBe(document.body);
    expect(popover.getAttribute('aria-label')).toBe('Ayuda del costo');
    expect(popover.textContent).toContain('Lo que cuesta cada unidad');
    expect(fixture.componentInstance.shown).toBe(1);
    popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.ui-popover')).toBeNull();
    expect(fixture.componentInstance.hidden).toBe(1);
    expect(document.activeElement).toBe(button);
  });
});
