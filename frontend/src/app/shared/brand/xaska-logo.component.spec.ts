import { TestBed } from '@angular/core/testing';
import { XaskaLogoComponent } from './xaska-logo.component';

describe('XaskaLogoComponent', () => {
  function render(inputs: Partial<Record<'wordmark' | 'tag' | 'label', unknown>> = {}) {
    const fixture = TestBed.createComponent(XaskaLogoComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('solo el ícono y decorativo por defecto', () => {
    const el = render();
    expect(el.querySelectorAll('svg').length).toBe(1);
    expect(el.querySelector('.xaska')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[role="img"]')).toBeNull();
  });

  it('con nombre, etiqueta POS y nombre accesible', () => {
    const el = render({ wordmark: true, tag: true, label: 'XASKA POS' });
    expect(el.querySelectorAll('svg').length).toBe(2);
    expect(el.querySelector('.xaska-tag')?.textContent).toBe('POS');
    const logo = el.querySelector('.xaska');
    expect(logo?.getAttribute('role')).toBe('img');
    expect(logo?.getAttribute('aria-label')).toBe('XASKA POS');
    expect(logo?.hasAttribute('aria-hidden')).toBeFalse();
  });

  it('la etiqueta POS solo va junto al nombre', () => {
    const el = render({ tag: true });
    expect(el.querySelector('.xaska-tag')).toBeNull();
  });
});
