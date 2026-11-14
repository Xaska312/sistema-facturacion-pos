import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MenuItem } from '../../shared/ui/menu-item';
import { MenuComponent } from '../../shared/ui/menu.component';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TooltipDirective } from '../../shared/ui/tooltip.directive';
import { AuthService } from '../../core/auth/auth.service';
import { XaskaLogoComponent } from '../../shared/brand/xaska-logo.component';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { PLATFORM_MENU } from './platform-menu';

/**
 * Consola de plataforma (solo administradores): negocios, suscripciones, códigos, planes y eventos de seguridad. No
 * entra a los datos de ningún negocio. Fuera del shell de negocio: funciona con la sesión de plataforma.
 * Identidad parte 4 (decisión 266): barra superior con el logo de XASKA y la etiqueta "Plataforma", y las secciones en
 * un dock flotante abajo, como la app del negocio.
 */
@Component({
  selector: 'app-platform-layout',
  imports: [MenuComponent, RouterOutlet, RouterLink, RouterLinkActive, TooltipDirective, XaskaLogoComponent, XIconComponent],
  template: `
    <!-- overflow-x-clip y min-w-0: nada ensancha la página en el celular (se veía con zoom y la barra se rompía). -->
    <div class="min-h-screen flex flex-col bg-ground overflow-x-clip">
      <header class="sticky top-0 z-30 h-16 shrink-0 flex items-center gap-2 sm:gap-3 px-3 md:px-6 bg-surface/85 backdrop-blur border-b border-line">
        <a routerLink="/plataforma" class="shrink-0 rounded-lg" aria-label="Consola de plataforma: inicio">
          <!-- En el celular solo el símbolo; el nombre completo desde tableta. Envueltos en un span porque el logo
               trae su propio inline-flex y le ganaba a "hidden": salían los dos (decisión 327). -->
          <span class="hidden sm:inline-flex"><app-xaska-logo [wordmark]="true" /></span>
          <span class="inline-flex sm:hidden"><app-xaska-logo /></span>
        </a>
        <span class="platform-tag">Plataforma</span>
        <span class="flex-1 min-w-0"></span>
        <span class="text-sm text-muted hidden md:inline truncate min-w-0">{{ auth.user()?.email }}</span>
        <button type="button" class="back-button" (click)="back()" aria-label="Volver a mis negocios">
          <i class="pi pi-arrow-left text-xs" aria-hidden="true"></i><span class="hidden sm:inline">Mis negocios</span>
        </button>
      </header>

      <main class="flex-1 min-w-0 w-full max-w-6xl mx-auto px-4 md:px-6 pt-6 pb-32">
        <router-outlet />
      </main>
    </div>

    <!-- Decisión 327: en el celular las 4 primeras secciones y "Más" con el resto, para que el dock quepa. -->
    <nav class="dock" aria-label="Consola de plataforma">
      @for (item of menu; track item.route; let i = $index) {
        <a [routerLink]="item.route" routerLinkActive="dock-item--active" ariaCurrentWhenActive="page" class="dock-item"
           [class.dock-item--extra]="i >= mainCount" [appTooltip]="item.label" tooltipPosition="top" [showDelay]="300">
          <app-xicon [name]="item.glyph" [size]="26" />
          <span class="dock-label">{{ item.label }}</span>
        </a>
      }
      <button type="button" class="dock-item dock-more" [class.dock-item--active]="extraActive()" aria-haspopup="menu"
              aria-label="Más secciones" (click)="moreMenu.toggle($event)">
        <i class="pi pi-ellipsis-h" aria-hidden="true"></i>
        <span class="dock-label">Más</span>
      </button>
    </nav>
    <app-menu #moreMenu [model]="moreItems" [popup]="true" appendTo="body" />
  `,
  styles: `
    .platform-tag {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.8125rem;
      font-weight: 700;
      background: var(--xaska-tag-bg);
      color: var(--xaska-tag-text);
    }
    .back-button {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 2.75rem;
      padding: 0 1rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 600;
      background: var(--surface-alt);
      color: var(--text);
      flex-shrink: 0;
    }
    .back-button:hover { background: var(--surface-border); }
    @media (max-width: 639px) { .back-button { padding: 0; width: 2.75rem; justify-content: center; } }
    .dock {
      position: fixed;
      left: 50%;
      bottom: max(0.75rem, env(safe-area-inset-bottom));
      transform: translateX(-50%);
      z-index: 40;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.5rem;
      border-radius: 1.5rem;
      background: color-mix(in srgb, var(--surface) 92%, transparent);
      border: 1px solid var(--surface-border);
      box-shadow: var(--elevation-overlay);
      backdrop-filter: blur(12px);
      max-width: calc(100vw - 1.5rem);
    }
    .dock-item {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-width: 3.25rem;
      height: 3.25rem;
      padding: 0 0.875rem;
      border-radius: 1.1rem;
      color: var(--text);
      font-weight: 700;
      font-size: 0.875rem;
      text-decoration: none;
      transition: background-color 150ms, transform 150ms;
    }
    .dock-item:hover { background: var(--surface-alt); }
    .dock-item:active { transform: scale(0.94); }
    .dock-item--active, .dock-item--active:hover {
      background: var(--brand);
      color: var(--brand-contrast);
      --xicon-fill: var(--brand-contrast);
    }
    /*
     * Decisión 351: "Más" solo en el celular, y ahí las secciones que guarda se esconden. Con dos clases para ganarle a
     * .dock-item { display: inline-flex } (antes iba antes en la hoja con la misma especificidad y perdía: salían
     * duplicadas en el computador y el celular seguía con todas).
     */
    .dock-item.dock-more { display: none; }
    @media (max-width: 639px) {
      .dock-item.dock-item--extra { display: none; }
      .dock-item.dock-more { display: inline-flex; }
    }
    /* En pantallas angostas solo los íconos; el nombre queda para lectores de pantalla y en el globo de ayuda. */
    @media (max-width: 767px) {
      .dock-item { min-width: 2.9rem; height: 2.9rem; padding: 0 0.6rem; }
      .dock-label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }
  `,
})
export class PlatformLayoutComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly menu = PLATFORM_MENU;
  /** Secciones que caben en el dock del celular; el resto va en "Más". */
  protected readonly mainCount = 4;
  protected readonly moreItems: MenuItem[] = PLATFORM_MENU.slice(this.mainCount)
    .map((item) => ({ label: item.label, routerLink: item.route }));
  private readonly url = toSignal(this.router.events.pipe(
    filter((e) => e instanceof NavigationEnd),
    map(() => this.router.url),
  ), { initialValue: this.router.url });
  /** "Más" se resalta cuando la pantalla abierta es una de las que guarda. */
  protected extraActive(): boolean {
    const url = this.url();
    return PLATFORM_MENU.slice(this.mainCount).some((item) => url.startsWith(item.route));
  }

  back(): void {
    void this.router.navigate(['/negocios']);
  }
}
