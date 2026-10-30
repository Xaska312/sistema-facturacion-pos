import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageHeaderComponent, glyphForUrl } from './page-header.component';

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

  it('pone el ícono propio que se le pida', () => {
    @Component({
      imports: [PageHeaderComponent],
      template: `<app-page-header title="Pedidos" glyph="orders" />`,
    })
    class GlyphHostComponent {}
    TestBed.configureTestingModule({ imports: [GlyphHostComponent] });
    const fixture = TestBed.createComponent(GlyphHostComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.glyph-tile app-xicon')).not.toBeNull();
  });
});

describe('glyphForUrl', () => {
  it('usa el ícono de la opción del menú más larga que contiene la dirección', () => {
    expect(glyphForUrl('/app/productos')).toBe('products');
    expect(glyphForUrl('/app/productos/nuevo?x=1')).toBe('products');
    expect(glyphForUrl('/app/caja/historial')).toBe('cash-history');
    expect(glyphForUrl('/app/inventario/movimientos')).toBe('movements');
    expect(glyphForUrl('/app/caja')).toBe('cash');
  });

  it('el inicio solo cuenta exacto y lo de fuera del menú no lleva ícono', () => {
    expect(glyphForUrl('/app')).toBe('home');
    expect(glyphForUrl('/app/manual')).toBeNull();
    expect(glyphForUrl('/plataforma/negocios')).toBeNull();
    expect(glyphForUrl('/app/cajas-x')).toBeNull();
  });
});
