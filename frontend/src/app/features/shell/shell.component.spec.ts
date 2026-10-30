import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { BrandingService } from '../../core/theme/branding.service';
import { EMPTY, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Subscription } from '../../core/api/api.models';
import { SubscriptionApi } from '../../core/api/subscription.api';
import { ShellComponent } from './shell.component';

@Component({ template: '<p>contenido</p>' })
class PageComponent {}

describe('ShellComponent', () => {
  const permissions = signal(new Set(['sales:create', 'cash:operate', 'branches:read']));
  const auth = {
    permissions,
    user: signal({ id: 'u1', email: 'ana@tienda.test', fullName: 'Ana Pérez', platformAdmin: false, emailVerified: true }),
    currentTenant: signal({ tradeName: 'Tienda Demo' }),
    isPlatformAdmin: signal(false),
    hasPermission: (p: string) => permissions().has(p),
    logout: jasmine.createSpy('logout').and.returnValue(of(undefined)),
  };

  beforeEach(async () => {
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
              { path: 'todo', title: 'Todo', component: PageComponent },
            ],
          },
        ]),
        { provide: AuthService, useValue: auth },
        // Por defecto la suscripción no responde: sin aviso (fase 8b).
        { provide: SubscriptionApi, useValue: { current: () => EMPTY } },
        // Sin logo (fase 8c).
        { provide: BrandingService, useValue: { logo: signal(null) } },
      ],
    }).compileComponents();
  });

  it('pone en el dock solo los módulos permitidos, con su ícono, más "Todo" (decisión 263)', () => {
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const dock = element.querySelector('nav[aria-label="Módulos"]') as HTMLElement;
    const labels = Array.from(dock.querySelectorAll('a.dock-item')).map((a) => a.textContent?.trim());
    expect(labels).toEqual(['Inicio', 'Vender', 'Mi caja', 'Todo']);
    expect(dock.querySelectorAll('app-xicon svg').length).toBe(4);
    expect(dock.querySelector('a[href="/app/todo"]')).not.toBeNull();
    expect(element.textContent).toContain('Tienda Demo');
    expect(element.querySelector('.avatar')?.textContent?.trim()).toBe('AP');
  });

  it('abre "Todo" con Ctrl + K', async () => {
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/app/todo');
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

  it('avisa que la prueba gratis está por terminar y cómo pagar (fase 8b)', () => {
    const trial = {
      status: 'TRIAL', daysLeft: 2, graceEndsAt: null, paymentInstructions: 'Nequi 300 000 0000',
    } as unknown as Subscription;
    TestBed.overrideProvider(SubscriptionApi, { useValue: { current: () => of(trial) } });
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const banner = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');
    expect(banner?.textContent).toContain('Tu prueba gratis termina en 2 días.');
    expect(banner?.textContent).toContain('Nequi 300 000 0000');
  });
});
