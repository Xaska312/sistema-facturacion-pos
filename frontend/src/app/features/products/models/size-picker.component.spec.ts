import { TestBed } from '@angular/core/testing';
import { SizePickerComponent } from './size-picker.component';

describe('SizePickerComponent (fase 8d)', () => {
  function setup(locked: string[] = []) {
    TestBed.configureTestingModule({ imports: [SizePickerComponent] });
    const fixture = TestBed.createComponent(SizePickerComponent);
    fixture.componentRef.setInput('sizes', [
      { label: '37', equivalent: null },
      { label: '38', equivalent: 'EU 39' },
      { label: '39', equivalent: null },
    ]);
    fixture.componentRef.setInput('locked', locked);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      Array.from(element.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
        .find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
    return { fixture, element, button };
  }

  it('elige tallas en el orden de la escala', () => {
    const { fixture, button } = setup();
    button('39').click();
    button('37').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toEqual(['37', '39']);
    expect(button('37').getAttribute('aria-pressed')).toBe('true');
    expect(button('38').title).toBe('38 = EU 39');
    button('37').click();
    expect(fixture.componentInstance.selected()).toEqual(['39']);
  });

  it('las tallas que ya existen se ven marcadas, no se quitan y no cuentan como nuevas', () => {
    const { fixture, element, button } = setup(['38']);
    expect(button('38').disabled).toBeTrue();
    expect(button('38').getAttribute('aria-pressed')).toBe('true');
    const all = Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.trim() === 'Todas') as HTMLButtonElement;
    all.click();
    expect(fixture.componentInstance.selected()).toEqual(['37', '39']);
  });
});
