import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MenuItem as PrimeMenuItem } from 'primeng/api';
import { DrawerModule } from 'primeng/drawer';
import { MenuModule } from 'primeng/menu';
import { TooltipModule } from 'primeng/tooltip';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { THEME_MODES, ThemeMode, themeModeIcon } from '../../core/theme/theme-mode';
import { ThemeService } from '../../core/theme/theme.service';
import { UI_PREF_KEYS, readUiPref, writeUiPref } from '../../shared/ui-prefs';
import { buildBreadcrumbs } from './breadcrumbs';
import { EXACT_MATCH_ROUTES, MENU, initials, visibleMenu, withHeadings } from './menu';

interface ThemeOption extends PrimeMenuItem {
  mode: ThemeMode;
}

/**
 * Estructura de la app: menú lateral (contraíble a solo iconos; en móvil, cajón con botón hamburguesa),
 * barra superior con migas de pan, negocio, tema y menú de usuario, y el contenido de cada pantalla.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, DrawerModule, MenuModule, TooltipModule],
  template: `
    <button type="button" class="skip-link" (click)="focusMain()">Saltar al contenido</button>

    <div class="min-h-screen flex">
      <aside class="hidden md:flex flex-col sticky top-0 h-screen shrink-0 bg-surface border-r border-line
                    transition-[width] duration-200 ease-out"
             [class]="collapsed() ? 'w-18' : 'w-64'" aria-label="Menú principal">
        <div class="h-14 flex items-center gap-2 border-b border-line" [class]="collapsed() ? 'justify-center' : 'px-4'">
          <ng-container *ngTemplateOutlet="logo" />
          @if (!collapsed()) {
            <span class="font-semibold truncate">POS Híbrido</span>
          }
        </div>
        <ng-container *ngTemplateOutlet="nav; context: { $implicit: collapsed() }" />
        <div class="p-2 border-t border-line">
          <button type="button" class="nav-link w-full" [class.justify-center]="collapsed()"
                  [attr.aria-expanded]="!collapsed()" (click)="toggleCollapsed()"
                  pTooltip="Expandir menú" [tooltipDisabled]="!collapsed()" tooltipPosition="right" tooltipEvent="both">
            <i class="pi" [class.pi-angle-double-left]="!collapsed()" [class.pi-angle-double-right]="collapsed()"
               aria-hidden="true"></i>
            <span [class.sr-only]="collapsed()">{{ collapsed() ? 'Expandir menú' : 'Contraer menú' }}</span>
          </button>
        </div>
      </aside>

      <p-drawer [(visible)]="drawerOpen" position="left" [style]="{ width: '18rem' }" styleClass="md:hidden"
                [blockScroll]="true">
        <ng-template #header>
          <div class="flex items-center gap-2">
            <ng-container *ngTemplateOutlet="logo" />
            <span class="font-semibold">POS Híbrido</span>
          </div>
        </ng-template>
        <ng-container *ngTemplateOutlet="nav; context: { $implicit: false }" />
      </p-drawer>

      <div class="flex-1 min-w-0 flex flex-col">
        <header class="sticky top-0 z-30 h-14 shrink-0 flex items-center gap-2 px-3 md:px-6 bg-surface border-b border-line">
          <button type="button" class="icon-button md:hidden" aria-label="Abrir menú" aria-haspopup="dialog"
                  [attr.aria-expanded]="drawerOpen()" (click)="drawerOpen.set(true)">
            <i class="pi pi-bars" aria-hidden="true"></i>
          </button>

          <nav aria-label="Ruta de navegación" class="flex-1 min-w-0">
            <ol class="flex items-center gap-1.5 text-sm min-w-0">
              @for (crumb of crumbs(); track $index; let last = $last) {
                <li class="items-center gap-1.5 min-w-0" [class]="last ? 'flex' : 'hidden sm:flex'">
                  @if (crumb.route) {
                    <a [routerLink]="crumb.route" class="text-muted hover:text-fg hover:underline whitespace-nowrap">
                      {{ crumb.label }}
                    </a>
                  } @else if (last) {
                    <span class="font-medium truncate" aria-current="page">{{ crumb.label }}</span>
                  } @else {
                    <span class="text-muted whitespace-nowrap">{{ crumb.label }}</span>
                  }
                  @if (!last) {
                    <i class="pi pi-angle-right text-xs text-muted" aria-hidden="true"></i>
                  }
                </li>
              }
            </ol>
          </nav>

          <span class="hidden lg:flex items-center gap-2 text-sm text-muted max-w-56" title="Negocio actual">
            <i class="pi pi-building" aria-hidden="true"></i>
            <span class="truncate">{{ tradeName() }}</span>
          </span>

          <button type="button" class="icon-button" aria-haspopup="menu" [attr.aria-label]="themeButtonLabel()"
                  (click)="themeMenu.toggle($event)">
            <i [class]="themeIcon()" aria-hidden="true"></i>
          </button>
          <p-menu #themeMenu [model]="themeItems()" [popup]="true" appendTo="body">
            <ng-template #item let-option>
              <span class="flex items-center gap-2 px-3 py-2 min-w-44">
                <i [class]="option.icon" aria-hidden="true"></i>
                <span class="flex-1">{{ option.label }}</span>
                @if (option.mode === theme.mode()) {
                  <i class="pi pi-check text-brand" aria-hidden="true"></i>
                  <span class="sr-only">(seleccionado)</span>
                }
              </span>
            </ng-template>
          </p-menu>

          <button type="button" class="user-button" aria-haspopup="menu" [attr.aria-label]="'Menú de usuario: ' + userName()"
                  (click)="userMenu.toggle($event)">
            <span class="avatar" aria-hidden="true">{{ userInitials() }}</span>
            <span class="hidden sm:inline text-sm max-w-40 truncate">{{ userName() }}</span>
            <i class="pi pi-chevron-down text-xs text-muted" aria-hidden="true"></i>
          </button>
          <p-menu #userMenu [model]="userItems()" [popup]="true" appendTo="body" />
        </header>

        <main #main id="main" tabindex="-1" class="flex-1 min-w-0 p-4 md:p-6 outline-none">
          <router-outlet />
        </main>
      </div>
    </div>

    <ng-template #nav let-compact>
      <nav class="flex-1 overflow-y-auto p-2" aria-label="Secciones">
        <ul class="flex flex-col gap-0.5">
          @for (entry of menu(); track entry.item.route) {
            @if (entry.heading) {
              <li aria-hidden="true">
                @if (compact) {
                  <hr class="my-2 mx-2 border-line" />
                } @else {
                  <p class="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{{ entry.heading }}</p>
                }
              </li>
            }
            <li>
              <a [routerLink]="entry.item.route" routerLinkActive="nav-link--active" ariaCurrentWhenActive="page"
                 [routerLinkActiveOptions]="{ exact: exactRoutes.has(entry.item.route) }"
                 class="nav-link" [class.justify-center]="compact"
                 [pTooltip]="entry.item.label" [tooltipDisabled]="!compact" tooltipPosition="right" tooltipEvent="both">
                <i [class]="entry.item.icon" aria-hidden="true"></i>
                <span [class.sr-only]="compact">{{ entry.item.label }}</span>
              </a>
            </li>
          }
        </ul>
      </nav>
    </ng-template>

    <ng-template #logo>
      <svg viewBox="0 0 64 64" class="size-8 shrink-0" aria-hidden="true">
        <rect width="64" height="64" rx="14" class="logo-bg" />
        <path class="logo-fg" d="M20 16h24a2 2 0 0 1 2 2v30l-4-3-4 3-4-3-4 3-4-3-4 3-4-3V18a2 2 0 0 1 2-2z" />
        <path class="logo-lines" d="M25 25h14M25 31h14M25 37h8" />
      </svg>
    </ng-template>
  `,
  styles: `
    .skip-link {
      position: fixed;
      top: 0.5rem;
      left: 0.5rem;
      z-index: 3000;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      background: var(--brand);
      color: var(--brand-contrast);
      transform: translateY(-200%);
    }
    .skip-link:focus-visible { transform: none; }
    .nav-link {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 2.5rem;
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      color: var(--text-muted);
      text-decoration: none;
      white-space: nowrap;
      transition: background-color 150ms, color 150ms;
    }
    .nav-link:hover { background: var(--surface-alt); color: var(--text); }
    .nav-link--active, .nav-link--active:hover {
      background: var(--brand-soft);
      color: var(--brand-soft-text);
      font-weight: 600;
    }
    .nav-link .pi { font-size: 1.05rem; width: 1.25rem; text-align: center; }
    .icon-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      flex-shrink: 0;
      border-radius: 9999px;
      color: var(--text-muted);
    }
    .icon-button:hover { background: var(--surface-alt); color: var(--text); }
    .user-button {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 2.5rem;
      padding: 0.25rem 0.5rem 0.25rem 0.25rem;
      border-radius: 9999px;
    }
    .user-button:hover { background: var(--surface-alt); }
    .avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: var(--brand-soft);
      color: var(--brand-soft-text);
    }
    .logo-bg { fill: var(--brand); }
    .logo-fg { fill: var(--brand-contrast); }
    .logo-lines { stroke: var(--brand); stroke-width: 3; stroke-linecap: round; fill: none; }
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly mainElement = viewChild.required<ElementRef<HTMLElement>>('main');

  protected readonly exactRoutes = EXACT_MATCH_ROUTES;
  protected readonly collapsed = signal(readUiPref(UI_PREF_KEYS.sidebarCollapsed) === 'true');
  protected readonly drawerOpen = signal(false);
  private readonly url = signal(this.router.url);
  private readonly pageTitle = signal<string | null>(deepestTitle(this.router.routerState.snapshot.root));

  protected readonly menu = computed(() => {
    const permissions = this.auth.permissions();
    return withHeadings(visibleMenu((p) => permissions.has(p)));
  });
  protected readonly crumbs = computed(() => buildBreadcrumbs(this.url(), this.pageTitle(), MENU));
  protected readonly tradeName = computed(() => this.auth.currentTenant()?.tradeName ?? 'Mi negocio');
  protected readonly userName = computed(() => this.auth.user()?.fullName ?? 'Usuario');
  protected readonly userInitials = computed(() => initials(this.auth.user()?.fullName));

  protected readonly themeIcon = computed(() => themeModeIcon(this.theme.mode()));
  protected readonly themeButtonLabel = computed(() => {
    const current = THEME_MODES.find((m) => m.mode === this.theme.mode())?.label ?? '';
    return `Tema de color: ${current}`;
  });
  protected readonly themeItems = computed<ThemeOption[]>(() =>
    THEME_MODES.map((option) => ({
      mode: option.mode,
      label: option.label,
      icon: option.icon,
      command: () => this.theme.setMode(option.mode),
    })),
  );
  protected readonly userItems = computed<PrimeMenuItem[]>(() => [
    {
      label: this.auth.user()?.email ?? '',
      items: [
        { label: 'Cambiar negocio', icon: 'pi pi-sync', command: () => this.switchTenant() },
        { separator: true },
        { label: 'Salir', icon: 'pi pi-sign-out', command: () => this.logout() },
      ],
    },
  ]);

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((event) => {
        this.url.set(event.urlAfterRedirects);
        this.pageTitle.set(deepestTitle(this.router.routerState.snapshot.root));
        this.drawerOpen.set(false);
      });
  }

  toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    writeUiPref(UI_PREF_KEYS.sidebarCollapsed, String(next));
  }

  focusMain(): void {
    this.mainElement().nativeElement.focus();
  }

  switchTenant(): void {
    void this.router.navigate(['/negocios']);
  }

  logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}

/** Título de la ruta más profunda activa (el que se ve en la pestaña). */
export function deepestTitle(root: ActivatedRouteSnapshot): string | null {
  let node: ActivatedRouteSnapshot | null = root;
  let title: string | null = null;
  while (node) {
    title = node.title ?? title;
    node = node.firstChild;
  }
  return title;
}
