import { Component, DestroyRef, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MenuItem as PrimeMenuItem } from 'primeng/api';
import { DrawerModule } from 'primeng/drawer';
import { MenuModule } from 'primeng/menu';
import { TooltipModule } from 'primeng/tooltip';
import { filter } from 'rxjs';
import { Subscription } from '../../core/api/api.models';
import { SubscriptionApi } from '../../core/api/subscription.api';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { XaskaLogoComponent } from '../../shared/brand/xaska-logo.component';
import { BrandingService } from '../../core/theme/branding.service';
import { AuthService } from '../../core/auth/auth.service';
import { THEME_MODES, ThemeMode, themeModeIcon } from '../../core/theme/theme-mode';
import { ThemeService } from '../../core/theme/theme.service';
import { HelpPanelComponent } from '../../shared/help/help-panel.component';
import { helpForUrl } from '../../shared/help/screen-help';
import { TourId } from '../../shared/tour/tour';
import { TourService } from '../../shared/tour/tour.service';
import { KitchenPrinterService } from '../kitchen/kitchen-printer';
import { buildBreadcrumbs } from './breadcrumbs';
import { EXACT_MATCH_ROUTES, MENU, dockItems, initials, visibleMenu } from './menu';
import { subscriptionBanner } from './subscription-banner';

interface ThemeOption extends PrimeMenuItem {
  mode: ThemeMode;
}

/**
 * Estructura de la app (identidad, decisión 263): barra superior con el logo, migas de pan, negocio, ayuda, tema y
 * menú de usuario; el contenido de cada pantalla, y abajo un dock flotante con los módulos del día a día más
 * "Todo" (todos los módulos que permite el rol). Ctrl + K abre "Todo".
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DrawerModule, MenuModule, TooltipModule, HelpPanelComponent,
    XaskaLogoComponent, XIconComponent],
  template: `
    <button type="button" class="skip-link" (click)="focusMain()">Saltar al contenido</button>

    <div class="min-h-screen flex flex-col">
      <header class="sticky top-0 z-30 h-16 shrink-0 flex items-center gap-2 px-3 md:px-6 bg-surface/85 backdrop-blur border-b border-line">
        <a routerLink="/app" class="shrink-0 mr-2 rounded-lg" aria-label="Ir al inicio">
          <app-xaska-logo [wordmark]="true" [tag]="true" label="XASKA POS" />
        </a>

        <nav aria-label="Ruta de navegación" class="flex-1 min-w-0">
          <ol class="flex items-center gap-1.5 text-sm min-w-0">
            @for (crumb of crumbs(); track $index; let last = $last) {
              <li class="items-center gap-1.5 min-w-0" [class]="last ? 'hidden sm:flex' : 'hidden md:flex'">
                @if (crumb.route) {
                  <a [routerLink]="crumb.route" class="text-muted hover:text-fg hover:underline whitespace-nowrap">
                    {{ crumb.label }}
                  </a>
                } @else if (last) {
                  <span class="font-semibold truncate" aria-current="page">{{ crumb.label }}</span>
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
          @if (brandLogo(); as logo) {
            <img [src]="logo" alt="" class="h-8 max-w-24 object-contain" aria-hidden="true" />
          }
          <span class="truncate">{{ tradeName() }}</span>
        </span>

        @if (helpTopic()) {
          <button type="button" class="icon-button" aria-label="Ayuda de esta pantalla" aria-haspopup="dialog"
                  [attr.aria-expanded]="helpOpen()" pTooltip="Ayuda" tooltipPosition="bottom" (click)="helpOpen.set(true)">
            <i class="pi pi-question-circle" aria-hidden="true"></i>
          </button>
        }
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

      @if (banner(); as b) {
        @if (!bannerClosed() || sub()?.status === 'EXPIRED') {
          <div role="status" class="px-3 md:px-6 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-line bg-surface-alt"
               [class.text-danger]="b.tone === 'danger'" [class.text-warning]="b.tone === 'warning'">
            <div class="text-sm">
              <span class="font-medium">{{ b.text }}</span>
              <span class="block sm:inline sm:ml-2 text-muted">Cómo pagar: {{ sub()?.paymentInstructions }}</span>
              @if (canManageSettings()) {
                <a routerLink="/app/ajustes" class="block sm:inline sm:ml-2 font-medium hover:underline text-fg">Ver mi suscripción</a>
              }
            </div>
            @if (sub()?.status !== 'EXPIRED') {
              <button type="button" class="icon-button shrink-0 sm:-my-1" aria-label="Cerrar aviso" (click)="bannerClosed.set(true)">
                <i class="pi pi-times" aria-hidden="true"></i>
              </button>
            }
          </div>
        }
      }

      @if (helpTopic(); as topic) {
        <p-drawer [(visible)]="helpOpen" position="right" [style]="{ width: 'min(24rem, 100vw)' }" [header]="'Ayuda: ' + topic.title">
          <app-help-panel [topic]="topic" [showTour]="tourAvailable() !== null" (startTour)="startTour($event)" />
        </p-drawer>
      }

      <main #main id="main" tabindex="-1" class="flex-1 min-w-0 w-full max-w-[96rem] mx-auto px-4 pt-4 md:px-8 md:pt-6 pb-32 outline-none">
        <router-outlet />
      </main>
    </div>

    <nav class="dock" aria-label="Módulos">
      @for (item of dock(); track item.route; let i = $index) {
        <a [routerLink]="item.route" routerLinkActive="dock-item--active" ariaCurrentWhenActive="page"
           [routerLinkActiveOptions]="{ exact: exactRoutes.has(item.route) }" class="dock-item"
           [class.dock-item--extra]="i >= 4" [pTooltip]="item.label" tooltipPosition="top" [showDelay]="300">
          <app-xicon [name]="item.glyph" [size]="26" />
          <span class="sr-only">{{ item.label }}</span>
        </a>
      }
      <span class="dock-separator" aria-hidden="true"></span>
      <a routerLink="/app/todo" routerLinkActive="dock-item--active" ariaCurrentWhenActive="page"
         class="dock-item dock-all" pTooltip="Todos los módulos (Ctrl + K)" tooltipPosition="top" [showDelay]="300">
        <app-xicon name="all" [size]="26" />
        <span>Todo</span>
      </a>
    </nav>
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
      padding: 0 0.75rem;
      border-radius: 1.1rem;
      color: var(--text);
      font-weight: 700;
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
    .dock-separator {
      width: 1px;
      height: 2.25rem;
      margin: 0 0.25rem;
      background: var(--surface-border);
    }
    @media (max-width: 639px) {
      .dock-item--extra { display: none; }
      .dock-item { min-width: 2.9rem; height: 2.9rem; padding: 0 0.6rem; }
      .dock-all span { display: none; }
    }
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
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      background: var(--brand-soft);
      color: var(--brand-soft-text);
    }
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  /** Logo del negocio (fase 8c), si lo tiene. */
  protected readonly brandLogo = inject(BrandingService).logo;
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly tours = inject(TourService);
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly kitchenPrinter = inject(KitchenPrinterService);
  private readonly mainElement = viewChild.required<ElementRef<HTMLElement>>('main');

  protected readonly exactRoutes = EXACT_MATCH_ROUTES;
  protected readonly helpOpen = signal(false);
  private readonly url = signal(this.router.url);
  private readonly pageTitle = signal<string | null>(deepestTitle(this.router.routerState.snapshot.root));

  protected readonly sub = signal<Subscription | null>(null);
  protected readonly banner = computed(() => subscriptionBanner(this.sub()));
  protected readonly bannerClosed = signal(false);
  protected readonly canManageSettings = computed(() => this.auth.permissions().has('settings:manage'));

  /** Módulos del dock, según los permisos y el tipo de negocio (Fase 12a). */
  protected readonly dock = computed(() => {
    const permissions = this.auth.permissions();
    return dockItems(visibleMenu((p) => permissions.has(p)), this.auth.currentTenant()?.businessType ?? 'RETAIL');
  });
  protected readonly crumbs = computed(() => buildBreadcrumbs(this.url(), this.pageTitle(), MENU));
  protected readonly helpTopic = computed(() => helpForUrl(this.url()));
  /** Recorrido de la pantalla actual, si el usuario ve lo que recorre. */
  protected readonly tourAvailable = computed(() => {
    const topic = this.helpTopic();
    if (!topic?.tour) {
      return null;
    }
    return !topic.tourPermission || this.auth.permissions().has(topic.tourPermission) ? topic.tour : null;
  });
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
        ...(this.tourAvailable()
          ? [{ label: 'Ver recorrido guiado', icon: 'pi pi-directions', command: () => this.startTour(this.tourAvailable() ?? undefined) }]
          : []),
        { label: 'Cambiar negocio', icon: 'pi pi-sync', command: () => this.switchTenant() },
        ...(this.auth.isPlatformAdmin()
          ? [{ label: 'Consola de plataforma', icon: 'pi pi-server', command: () => void this.router.navigate(['/plataforma']) }]
          : []),
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
        this.helpOpen.set(false);
      });

    // Si este equipo es impresora de comandas (Fase 12b-3), imprime desde cualquier pantalla.
    this.kitchenPrinter.start();
    inject(DestroyRef).onDestroy(() => this.kitchenPrinter.stop());

    this.subscriptionApi.current().subscribe({
      next: (s) => this.sub.set(s),
      error: () => { /* No mostrar nada en caso de fallo */ }
    });
  }

  /** Ctrl + K (o Cmd + K) abre "Todo" desde cualquier pantalla. */
  @HostListener('document:keydown', ['$event'])
  protected openAll(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      void this.router.navigate(['/app/todo']);
    }
  }

  focusMain(): void {
    this.mainElement().nativeElement.focus();
  }

  /** Desde la ayuda o el menú de usuario: la pantalla que define el recorrido lo inicia. */
  startTour(id: TourId | undefined): void {
    this.helpOpen.set(false);
    if (id) {
      this.tours.requestReplay(id);
    }
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
