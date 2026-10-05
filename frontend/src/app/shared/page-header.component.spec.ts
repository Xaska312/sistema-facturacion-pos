import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageHeaderComponent } from './page-header.component';

@Component({
  imports: [PageHeaderComponent],
  template: `<app-page-header title="Sucursales" description="Puntos de venta del negocio">
    <button type="button">Nueva sucursal</button>
  </app-page-header>`,
})
class HostComponent {}

describe('PageHeaderComponent', () => {
  it('muestra título, descripción y acciones', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Sucursales');
    expect(element.textContent).toContain('Puntos de venta del negocio');
    expect(element.querySelector('button')?.textContent).toContain('Nueva sucursal');
  });
});
