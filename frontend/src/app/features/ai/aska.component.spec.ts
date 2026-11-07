import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AskaComponent } from './aska.component';
import { AskaState } from './aska-state';

describe('AskaComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('abierta desde otra pantalla (Resumen del día) se puede cerrar y no se vuelve a abrir sola', () => {
    const fixture = TestBed.createComponent(AskaComponent);
    fixture.detectChanges();
    const aska = fixture.componentInstance as unknown as { open: () => boolean; close: () => void };
    TestBed.inject(AskaState).open();
    TestBed.flushEffects();
    expect(aska.open()).toBeTrue();
    aska.close();
    TestBed.flushEffects();
    fixture.detectChanges();
    expect(aska.open()).toBeFalse();
    TestBed.inject(AskaState).open();
    TestBed.flushEffects();
    expect(aska.open()).toBeTrue();
  });
});
