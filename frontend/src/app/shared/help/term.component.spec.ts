import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { GLOSSARY } from './glossary';
import { TermComponent } from './term.component';

describe('TermComponent', () => {
  it('muestra el término con un botón accesible que abre la definición', async () => {
    TestBed.configureTestingModule({ imports: [TermComponent], providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(TermComponent);
    fixture.componentRef.setInput('term', 'kardex');
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('¿Qué significa Kardex?');
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.body.textContent).toContain(GLOSSARY.kardex.text);
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('todas las definiciones son cortas y sin códigos técnicos', () => {
    for (const entry of Object.values(GLOSSARY)) {
      expect(entry.text.length).toBeLessThan(260);
      expect(entry.text).not.toMatch(/[a-z]+:[a-z]+/);
    }
  });
});
