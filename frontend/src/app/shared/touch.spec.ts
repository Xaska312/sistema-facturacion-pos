import { focusOnDesktop, isTouch } from './touch';

describe('Pantallas táctiles (decisión 314)', () => {
  it('en el celular no pone el cursor (no abre el teclado); en el computador sí, sin mover la pantalla', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const media = spyOn(globalThis, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    expect(isTouch()).toBeTrue();
    focusOnDesktop(input);
    expect(document.activeElement).not.toBe(input);
    media.and.returnValue({ matches: false } as MediaQueryList);
    focusOnDesktop(input);
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
