import { TestBed } from '@angular/core/testing';
import { XaskaIaLogoComponent } from './xaska-ia-logo.component';

describe('XaskaIaLogoComponent (decisión 295)', () => {
  function render(inputs: Partial<Record<'wordmark' | 'label' | 'size', unknown>> = {}) {
    const fixture = TestBed.createComponent(XaskaIaLogoComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('solo el monograma y decorativo por defecto', () => {
    const el = render();
    expect(el.querySelectorAll('svg').length).toBe(1);
    expect(el.querySelector('.xia-tag')).toBeNull();
    expect(el.querySelector('.xia')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('con el nombre, la etiqueta IA y nombre accesible', () => {
    const el = render({ wordmark: true, label: 'XASKA IA', size: 'sm' });
    expect(el.querySelector('.xia-name')?.textContent).toBe('XASKA');
    expect(el.querySelector('.xia-tag')?.textContent).toBe('IA');
    expect(el.querySelector('.xia')?.getAttribute('role')).toBe('img');
    expect(el.querySelector('.xia')?.getAttribute('aria-label')).toBe('XASKA IA');
    expect(el.querySelector('.xia-sm')).not.toBeNull();
  });

  it('cada logo usa sus propios degradados para el volumen', () => {
    const a = render().querySelector('linearGradient')?.id;
    const b = render().querySelector('linearGradient')?.id;
    expect(a).toMatch(/^xia-tile-\d+$/);
    expect(a).not.toBe(b);
    expect(render().querySelector('rect')?.getAttribute('fill')).toMatch(/^url\(#xia-tile-\d+\)$/);
  });
});
