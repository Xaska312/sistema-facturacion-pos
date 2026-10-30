import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CashSession } from '../../core/api/api.models';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { openedSince } from './pos-labels';

/**
 * Encabezado del POS en baldosa (identidad parte 3, decisión 265): volver al inicio, negocio, caja (abierta desde…),
 * sucursal, usuario, conexión, accesos a Caja y Ventas y ayuda de atajos.
 */
@Component({
  selector: 'app-pos-header',
  imports: [RouterLink, HasPermissionDirective, XIconComponent],
  template: `
    <header class="pos-bar">
      <a routerLink="/app" class="pos-link pos-link--home" aria-label="Volver al inicio" title="Volver al inicio">
        <app-xicon name="home" [size]="22" /><span class="hidden sm:inline">Inicio</span>
      </a>
      <span class="flex items-center gap-2 min-w-0">
        <app-xicon name="sell" [size]="26" />
        <span class="font-extrabold tracking-tight truncate max-w-56">{{ businessName() }}</span>
      </span>

      @if (session(); as s) {
        <span class="pill bg-success-soft text-success-soft-fg" [title]="'Abierta por ' + (s.openedByName ?? userName())">
          <i class="pi pi-lock-open text-xs" aria-hidden="true"></i>
          Caja abierta <span class="hidden sm:inline">{{ since() }}</span>
        </span>
        <span class="text-sm text-muted truncate">
          {{ s.registerCode }} · {{ s.branchName }}<span class="hidden lg:inline"> · {{ userName() }}</span>
        </span>
      } @else if (session() === null) {
        <span class="pill bg-warning-soft text-warning-soft-fg">
          <i class="pi pi-lock text-xs" aria-hidden="true"></i>Caja cerrada
        </span>
      }

      <span class="flex-1"></span>

      <span role="status" class="inline-flex items-center gap-1.5 text-sm"
            [class.text-muted]="online()" [class.text-danger]="!online()">
        <span class="size-2 rounded-full" [class.bg-success]="online()" [class.bg-danger]="!online()" aria-hidden="true"></span>
        {{ online() ? 'En línea' : 'Sin conexión' }}
      </span>
      <a routerLink="/app/caja" class="pos-link"><app-xicon name="cash" [size]="20" />Caja</a>
      <a *hasPermission="'sales:read'" routerLink="/app/ventas" class="pos-link"><app-xicon name="sales" [size]="20" />Ventas</a>
      <button type="button" class="pos-link" data-tour="pos-help" aria-label="Atajos de teclado" title="Atajos de teclado (?)"
              (click)="help.emit()">
        <i class="pi pi-question-circle" aria-hidden="true"></i>
      </button>
    </header>
  `,
  styles: `
    /* Barra en baldosa (identidad parte 3): flota sobre el fondo como las baldosas de Vender. */
    .pos-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      column-gap: 0.75rem;
      row-gap: 0.25rem;
      padding: 0.375rem 0.5rem;
      border-radius: 1.25rem;
      background: var(--surface);
      border: 1px solid var(--surface-border);
      box-shadow: var(--elevation-card);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      border-radius: 9999px;
      padding: 0.125rem 0.625rem;
      font-size: 0.875rem;
      font-weight: 600;
    }
    .pos-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      min-height: 2.75rem;
      min-width: 2.75rem;
      padding: 0 0.625rem;
      border-radius: 0.875rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-muted);
    }
    .pos-link:hover {
      color: var(--text);
      background: var(--surface-alt);
    }
    .pos-link--home {
      background: var(--surface-alt);
      color: var(--text);
    }
  `,
})
export class PosHeaderComponent {
  readonly businessName = input<string>('');
  /** {@code undefined} mientras carga; {@code null} sin caja abierta. */
  readonly session = input<CashSession | null | undefined>(undefined);
  readonly userName = input<string>('');
  readonly online = input(true);
  readonly help = output<void>();

  protected readonly since = computed(() => {
    const s = this.session();
    return s ? openedSince(s.openedAt) : '';
  });
}
