import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { toursKey } from './tour';
import { TourOverlayComponent } from './tour-overlay.component';
import { TourService } from './tour.service';

describe('TourOverlayComponent', () => {
  const key = toursKey('u-overlay');
  let target: HTMLElement;

  beforeEach(() => {
    localStorage.removeItem(key);
    target = document.createElement('div');
    target.setAttribute('data-tour', 'zona');
    target.style.cssText = 'position:fixed;top:40px;left:40px;width:120px;height:40px';
    document.body.appendChild(target);
    TestBed.configureTestingModule({
      imports: [TourOverlayComponent],
      providers: [{ provide: AuthService, useValue: { user: signal({ id: 'u-overlay' }) } }],
    });
  });

  afterEach(() => {
    target.remove();
    localStorage.removeItem(key);
  });

  it('muestra los pasos, avanza y Esc lo cierra sin que la tecla llegue a la pantalla', async () => {
    const fixture = TestBed.createComponent(TourOverlayComponent);
    const service = TestBed.inject(TourService);
    const element = fixture.nativeElement as HTMLElement;
    service.start({
      id: 'pos',
      steps: [
        { target: 'zona', title: 'El campo de código', text: 'Escanea aquí.' },
        { target: null, title: 'Listo', text: 'Eso es todo.' },
      ],
    });
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 10));
    fixture.detectChanges();

    const dialog = element.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Paso 1 de 2');
    expect(dialog?.textContent).toContain('El campo de código');
    expect(element.querySelector('.tour-spot')).not.toBeNull();

    (Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.includes('Siguiente')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.textContent).toContain('Paso 2 de 2');
    expect(element.textContent).toContain('Terminar');

    let reachedWindow = false;
    const listener = () => (reachedWindow = true);
    window.addEventListener('keydown', listener);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.removeEventListener('keydown', listener);
    fixture.detectChanges();

    expect(reachedWindow).toBeFalse();
    expect(service.active()).toBeNull();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(service.hasSeen('pos')).toBeTrue();
  });
});
