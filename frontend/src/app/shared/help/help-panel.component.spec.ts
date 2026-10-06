import { TestBed } from '@angular/core/testing';
import { TourId } from '../tour/tour';
import { HelpPanelComponent } from './help-panel.component';
import { SCREEN_HELP, helpForUrl } from './screen-help';

describe('ayuda por pantalla', () => {
  it('elige la ayuda por la ruta más larga', () => {
    expect(helpForUrl('/app')?.title).toBe('Inicio');
    expect(helpForUrl('/app/caja')?.title).toBe('Mi caja');
    expect(helpForUrl('/app/caja/historial?estado=OPEN')?.title).toBe('Historial de caja');
    expect(helpForUrl('/app/inventario/kardex/123')?.title).toBe('Kardex');
    expect(helpForUrl('/app/productos/abc')?.title).toBe('Productos');
    expect(helpForUrl('/app/no-existe')).toBeNull();
    expect(helpForUrl('/login')).toBeNull();
  });

  it('cada pantalla tiene de 3 a 4 consejos', () => {
    for (const topic of Object.values(SCREEN_HELP)) {
      expect(topic.tips.length).toBeGreaterThanOrEqual(3);
      expect(topic.tips.length).toBeLessThanOrEqual(4);
    }
  });

  it('muestra consejos, términos y el botón del recorrido', () => {
    TestBed.configureTestingModule({ imports: [HelpPanelComponent] });
    const fixture = TestBed.createComponent(HelpPanelComponent);
    fixture.componentRef.setInput('topic', SCREEN_HELP['/app']);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('ol li').length).toBe(4);
    expect(element.textContent).toContain('Existencia mínima');
    const tours: TourId[] = [];
    fixture.componentInstance.startTour.subscribe((id) => tours.push(id));
    (element.querySelector('.tour-start') as HTMLButtonElement).click();
    expect(tours).toEqual(['dashboard']);
  });
});
