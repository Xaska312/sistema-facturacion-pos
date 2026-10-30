import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthLayoutComponent } from './auth-layout.component';

@Component({
  imports: [AuthLayoutComponent],
  template: `<app-auth-layout width="lg"><form class="mi-formulario">Entrar</form></app-auth-layout>`,
})
class HostComponent {}

describe('AuthLayoutComponent', () => {
  it('muestra el logo de XASKA, el panel de marca y el contenido con el ancho pedido', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('XASKA POS');
    expect(element.querySelectorAll('.auth-tile app-xicon').length).toBe(4);
    expect(element.querySelector('main .auth-slot--lg .mi-formulario')).not.toBeNull();
  });
});
