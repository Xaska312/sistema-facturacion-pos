import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TooltipModule, XaskaLogoComponent, XIconComponent],
  template: `
    <div class="min-h-screen flex flex-col bg-ground">
      <header class="sticky top-0 z-30 h-16 shrink-0 flex items-center gap-3 px-3 md:px-6 bg-surface/85 backdrop-blur border-b border-line">
        <a routerLink="/plataforma" class="shrink-0 rounded-lg" aria-label="Consola de plataforma: inicio">
          <app-xaska-logo [wordmark]="true" />
        </a>
        <span class="platform-tag">Plataforma</span>
        <span class="flex-1"></span>
        <span class="text-sm text-muted hidden sm:inline truncate">{{ auth.user()?.email }}</span>
        <button type="button" class="back-button" (click)="back()">
          <i class="pi pi-arrow-left text-xs" aria-hidden="true"></i>Mis negocios
        </button>
      </header>

      <main class="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 pt-6 pb-32">
        <router-outlet />
      </main>
    </div>

    <nav class="dock" aria-label="Consola de plataforma">
      @for (item of menu; track item.route) {
        <a [routerLink]="item.route" routerLinkActive="dock-item--active" ariaCurrentWhenActive="page" class="dock-item"
           [pTooltip]="item.label" tooltipPosition="top" [showDelay]="300">
          <app-xicon [name]="item.glyph" [size]="26" />
          <span class="dock-label">{{ item.label }}</span>
        </a>
      }
    </nav>
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

  back(): void {
    void this.router.navigate(['/negocios']);
  }
}
