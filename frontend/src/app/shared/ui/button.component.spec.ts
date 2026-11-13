import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterLink } from '@angular/router';
import { ButtonLinkComponent } from './button-link.component';
import { ButtonComponent } from './button.component';
import { ButtonSeverity } from './button';

@Component({
  imports: [ButtonComponent, ButtonLinkComponent, RouterLink],
  template: `
    <form (submit)="$event.preventDefault(); submits = submits + 1">
      <app-button id="plain" label="Guardar" icon="pi pi-check" (clicked)="clicks = clicks + 1" />
      <app-button id="submit" type="submit" label="Enviar" />
    </form>
    <app-button id="look" label="Anular" [severity]="severity()" [text]="true" size="small" styleClass="w-full"
                class="col-span-2" />
    <app-button id="icon" icon="pi pi-trash" ariaLabel="Borrar" severity="danger" [rounded]="true" />
    <app-button id="busy" label="Cobrar" icon="pi pi-check" [loading]="loading()" (clicked)="clicks = clicks + 1" />
    <app-button id="off" label="No" [disabled]="true" (clicked)="clicks = clicks + 1" />
    <app-button id="right" label="Siguiente" icon="pi pi-arrow-right" iconPos="right" />
    <a id="link" appButton routerLink="/app/productos" label="Ver productos" icon="pi pi-box" [outlined]="true"
       severity="secondary" size="small"></a>
  `,
})
class ButtonHostComponent {
  clicks = 0;
  submits = 0;
  readonly severity = signal<ButtonSeverity>('danger');
  readonly loading = signal(false);
}

describe('ButtonComponent y a[appButton]', () => {
  let fixture: ComponentFixture<ButtonHostComponent>;
  let root: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(ButtonHostComponent);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  });

  const button = (id: string) => root.querySelector<HTMLButtonElement>(`#${id} button`)!;

  it('es un botón nativo con type="button" por defecto, ícono y texto; avisa el clic', () => {
    const el = button('plain');
    expect(el.type).toBe('button');
    expect(el.className).toBe('ui-button');
    expect(el.querySelector('.ui-button-icon.pi.pi-check')!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.ui-button-label')!.textContent!.trim()).toBe('Guardar');
    el.click();
    expect(fixture.componentInstance.clicks).toBe(1);
  });

  it('sin type="submit" no envía el formulario; con él, sí', () => {
    button('plain').click();
    expect(fixture.componentInstance.submits).toBe(0);
    button('submit').click();
    expect(fixture.componentInstance.submits).toBe(1);
  });

  it('severidad, variante, tamaño y styleClass van al botón; class queda en app-button', () => {
    const el = button('look');
    expect(el.classList).toContain('ui-button-danger');
    expect(el.classList).toContain('ui-button-text');
    expect(el.classList).toContain('ui-button-sm');
    expect(el.classList).toContain('w-full');
    expect(root.querySelector('#look')!.classList).toContain('col-span-2');
    fixture.componentInstance.severity.set('primary');
    fixture.detectChanges();
    expect(el.classList).not.toContain('ui-button-danger');
    expect(el.classList).not.toContain('ui-button-primary');
  });

  it('solo ícono: nombre accesible por aria-label, sin texto y redondo', () => {
    const el = button('icon');
    expect(el.getAttribute('aria-label')).toBe('Borrar');
    expect(el.classList).toContain('ui-button-icon-only');
    expect(el.classList).toContain('ui-button-rounded');
    expect(el.querySelector('.ui-button-label')).toBeNull();
  });

  it('cargando: se desactiva, cambia el ícono por el giro y no avisa clics', () => {
    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();
    const el = button('busy');
    expect(el.disabled).toBeTrue();
    expect(el.querySelector('.ui-dots')).not.toBeNull();
    expect(el.querySelector('.pi-check')).toBeNull();
    expect(el.querySelector('.ui-button-label')!.textContent!.trim()).toBe('Cobrar');
    el.click();
    expect(fixture.componentInstance.clicks).toBe(0);
  });

  it('desactivado no avisa clics', () => {
    const el = button('off');
    expect(el.disabled).toBeTrue();
    el.click();
    expect(fixture.componentInstance.clicks).toBe(0);
  });

  it('ícono a la derecha solo cuando hay texto', () => {
    expect(button('right').querySelector('.ui-button-icon')!.classList).toContain('ui-button-icon-right');
  });

  it('el enlace conserva su href y lleva el aspecto de botón', () => {
    const link = root.querySelector<HTMLAnchorElement>('#link')!;
    expect(link.getAttribute('href')).toBe('/app/productos');
    expect(link.classList).toContain('ui-button');
    expect(link.classList).toContain('ui-button-secondary');
    expect(link.classList).toContain('ui-button-outlined');
    expect(link.classList).toContain('ui-button-sm');
    expect(link.querySelector('.ui-button-label')!.textContent!.trim()).toBe('Ver productos');
    expect(link.querySelector('.pi-box')).not.toBeNull();
  });
});
