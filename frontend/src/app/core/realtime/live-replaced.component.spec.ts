import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiningEventsService } from './dining-events.service';
import { LiveReplacedComponent } from './live-replaced.component';

describe('LiveReplacedComponent (decisión 291)', () => {
  const replaced = signal(false);
  const takeOver = jasmine.createSpy('takeOver');
  let fixture: ComponentFixture<LiveReplacedComponent>;

  beforeEach(() => {
    replaced.set(false);
    takeOver.calls.reset();
    TestBed.configureTestingModule({
      imports: [LiveReplacedComponent],
      providers: [{ provide: DiningEventsService, useValue: { replaced, takeOver } }],
    });
    fixture = TestBed.createComponent(LiveReplacedComponent);
    fixture.detectChanges();
  });

  it('no muestra nada mientras esta pantalla tiene los avisos', () => {
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('avisa que otra pantalla los tomó y deja recibirlos aquí', () => {
    replaced.set(true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Los avisos en vivo pasaron a otra pantalla');
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Recibir avisos aquí');
    button.click();
    expect(takeOver).toHaveBeenCalledTimes(1);
  });
});
