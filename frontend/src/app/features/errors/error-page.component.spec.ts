import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORBIDDEN_DATA } from './error-data';
import { ErrorPageComponent } from './error-page.component';

describe('ErrorPageComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ErrorPageComponent], providers: [provideRouter([])] });
  });

  it('muestra la página 404 por defecto con enlace al inicio', () => {
    const fixture = TestBed.createComponent(ErrorPageComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent).toContain('No encontramos esta página');
    expect(element.querySelector('a[href="/app"]')).not.toBeNull();
  });

  it('muestra los textos de "sin permiso" y vuelve atrás', () => {
    const fixture = TestBed.createComponent(ErrorPageComponent);
    fixture.componentRef.setInput('code', FORBIDDEN_DATA.code);
    fixture.componentRef.setInput('heading', FORBIDDEN_DATA.heading);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('403');
    expect(element.querySelector('h1')?.textContent).toContain('No tienes permiso');

    const location = TestBed.inject(Location);
    spyOn(location, 'back');
    fixture.componentInstance.back();
    expect(location.back).toHaveBeenCalled();
  });
});
