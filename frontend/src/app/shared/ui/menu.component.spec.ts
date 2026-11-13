import { Component, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MenuItem } from './menu-item';
import { MenuComponent } from './menu.component';

@Component({
  imports: [MenuComponent],
  template: `
    <button id="opener" type="button" (click)="menu.toggle($event)">Usuario</button>
    <app-menu #menu [model]="items" [popup]="true" appendTo="body" />
  `,
})
class MenuHostComponent {
  readonly menu = viewChild.required(MenuComponent);
  readonly calls: string[] = [];
  readonly items: MenuItem[] = [
    {
      label: 'dueno@negocio.co',
      items: [
        { label: 'Planes y pagos', icon: 'pi pi-credit-card', command: () => this.calls.push('planes') },
        { label: 'Desactivado', disabled: true, command: () => this.calls.push('nunca') },
        { separator: true },
        { label: 'Salir', icon: 'pi pi-sign-out', command: () => this.calls.push('salir') },
      ],
    },
  ];
}

describe('MenuComponent', () => {
  let fixture: ComponentFixture<MenuHostComponent>;
  const opener = (): HTMLButtonElement => (fixture.nativeElement as HTMLElement).querySelector('#opener')!;
  const panel = (): HTMLElement | null => document.querySelector<HTMLElement>('.ui-menu');
  const list = (): HTMLElement => panel()!.querySelector<HTMLElement>('[role="menu"]')!;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(MenuHostComponent);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.componentInstance.menu().hide();
    (fixture.nativeElement as HTMLElement).remove();
  });

  it('se abre sobre <body> con el grupo, las opciones y el separador, y toma el foco', () => {
    opener().click();
    fixture.detectChanges();
    expect(panel()!.parentElement).toBe(document.body);
    expect(panel()!.querySelector('.ui-menu-submenu-label')!.textContent).toContain('dueno@negocio.co');
    expect(panel()!.querySelectorAll('[role="menuitem"]').length).toBe(3);
    expect(panel()!.querySelector('[role="separator"]')).not.toBeNull();
    expect(document.activeElement).toBe(list());
  });

  it('con el teclado salta las opciones desactivadas, Enter ejecuta y cierra, y el foco vuelve al botón', () => {
    opener().click();
    fixture.detectChanges();
    list().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    list().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(panel()!.querySelector('.ui-focus')!.textContent).toContain('Salir');
    list().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.calls).toEqual(['salir']);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(opener());
  });

  it('el clic en una opción la ejecuta; Escape y el clic fuera cierran', () => {
    opener().click();
    fixture.detectChanges();
    panel()!.querySelector<HTMLElement>('.ui-menu-item-content')!.click();
    expect(fixture.componentInstance.calls).toEqual(['planes']);
    expect(panel()).toBeNull();

    opener().click();
    fixture.detectChanges();
    list().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel()).toBeNull();

    opener().click();
    fixture.detectChanges();
    document.body.click();
    expect(panel()).toBeNull();
  });
});
