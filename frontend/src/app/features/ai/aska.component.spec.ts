import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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
    // Los efectos del componente corren con la detección de cambios.
    TestBed.inject(AskaState).open();
    fixture.detectChanges();
    expect(aska.open()).toBeTrue();
    aska.close();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(aska.open()).toBeFalse();
    TestBed.inject(AskaState).open();
    fixture.detectChanges();
    expect(aska.open()).toBeTrue();
  });

  it('abierta con una pregunta (las del correo del Resumen del día) la responde de una vez', () => {
    const fixture = TestBed.createComponent(AskaComponent);
    fixture.detectChanges();
    TestBed.inject(AskaState).open('¿Qué pasó con la caja?');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const ask = http.expectOne('/api/v1/ai/ask');
    expect(ask.request.body.question).toBe('¿Qué pasó con la caja?');
    // La siguiente vez que se abre sin pregunta no repite la anterior.
    const aska = fixture.componentInstance as unknown as { close: () => void };
    aska.close();
    TestBed.inject(AskaState).open();
    fixture.detectChanges();
    http.expectNone('/api/v1/ai/ask');
  });
});
