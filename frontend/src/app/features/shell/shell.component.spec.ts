import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { UI_PREF_KEYS } from '../../shared/ui-prefs';
import { ShellComponent } from './shell.component';

@Component({ template: '<p>contenido</p>' })
class PageComponent {}

describe('ShellComponent', () => {
  let savedCollapsed: string | null;

  const permissions = signal(new Set(['sales:create', 'cash:operate', 'branches:read']));
  const auth = {
    permissions,
    user: signal({ id: 'u1', email: 'ana@tienda.test', fullName: 'Ana Pérez', platformAdmin: false }),
    currentTenant: signal({ tradeName: 'Tienda Demo' }),
    isPlatformAdmin: signal(false),
    hasPermission: (p: string) => permissions().has(p),
    logout: jasmine.createSpy('logout').and.returnValue(of(undefined)),
  };

  beforeEach(async () => {
    savedCollapsed = localStorage.getItem(UI_PREF_KEYS.sidebarCollapsed);
    localStorage.removeItem(UI_PREF_KEYS.sidebarCollapsed);
    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([
          {
            // Sin componente en el padre: las pantallas se pintan en el router-outlet del shell del fixture.
            path: 'app',
            children: [
              { path: '', title: 'Inicio', component: PageComponent },
              { path: 'sucursales', title: 'Sucursales', component: PageComponent },
            ],
          },
        ]),
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    if (savedCollapsed === null) {
      localStorage.removeItem(UI_PREF_KEYS.sidebarCollapsed);
    } else {
      localStorage.setItem(UI_PREF_KEYS.sidebarCollapsed, savedCollapsed);
    }
  });

  it('muestra solo las opciones permitidas, con iconos, y el negocio actual', () => {
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const labels = Array.from(element.querySelectorAll('aside a.nav-link')).map((a) => a.textContent?.trim());
    expect(labels).toEqual(['Inicio', 'Vender', 'Mi caja', 'Sucursales']);
    expect(element.querySelectorAll('aside a.nav-link i.pi').length).toBe(4);
    expect(element.textContent).toContain('Tienda Demo');
    expect(element.querySelector('.avatar')?.textContent?.trim()).toBe('AP');
  });

  it('contrae el menú a solo iconos y recuerda la elección', () => {
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('aside button[aria-expanded]');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');

    toggle?.click();
    fixture.detectChanges();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(localStorage.getItem(UI_PREF_KEYS.sidebarCollapsed)).toBe('true');
    // Las etiquetas siguen disponibles para lectores de pantalla.
    const firstLabel = element.querySelector('aside a.nav-link span');
    expect(firstLabel?.classList.contains('sr-only')).toBeTrue();
    expect(firstLabel?.textContent).toContain('Inicio');
  });

  it('actualiza las migas de pan al navegar', async () => {
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/app/sucursales');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const crumbs = Array.from(element.querySelectorAll('nav[aria-label="Ruta de navegación"] li')).map((li) =>
      li.textContent?.trim(),
    );
    expect(crumbs).toEqual(['Inicio', 'Configuración', 'Sucursales']);
    expect(element.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Sucursales');
  });

  it('ofrece la ayuda de cada pantalla con sus consejos', async () => {
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/app/sucursales');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const help = element.querySelector('button[aria-label="Ayuda de esta pantalla"]') as HTMLButtonElement;
    expect(help).not.toBeNull();
    help.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.body.textContent).toContain('Ayuda: Sucursales');
    expect(document.body.textContent).toContain('Crea una sucursal por cada local');

    // Cerrar el panel y esperar su animación antes de destruir el módulo de pruebas.
    await TestBed.inject(Router).navigateByUrl('/app');
    fixture.detectChanges();
    await fixture.whenStable();
  });
});
