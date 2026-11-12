import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { PlatformLayoutComponent } from './platform-layout.component';
import { PLATFORM_MENU } from './platform-menu';

describe('Consola de plataforma en el celular (decisión 327)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlatformLayoutComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { user: signal(null) } }],
    });
  });

  it('deja 4 secciones en el dock y el resto en "Más"', () => {
    const fixture = TestBed.createComponent(PlatformLayoutComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.dock-item--extra').length).toBe(PLATFORM_MENU.length - 4);
    expect(el.querySelector('.dock-more')).not.toBeNull();
    const more = (fixture.componentInstance as unknown as { moreItems: { label: string }[] }).moreItems;
    expect(more.map((m) => m.label)).toEqual(PLATFORM_MENU.slice(4).map((m) => m.label));
  });

  it('muestra un solo logo por tamaño de pantalla', () => {
    const fixture = TestBed.createComponent(PlatformLayoutComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('header app-xaska-logo').length).toBe(2);
    expect(el.querySelector('header .hidden.sm\\:inline-flex app-xaska-logo')).not.toBeNull();
    expect(el.querySelector('header .sm\\:hidden app-xaska-logo')).not.toBeNull();
  });
});
