import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CashSession } from '../../core/api/api.models';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { openedSince } from './pos-labels';

/** Encabezado compacto del POS: negocio, caja (abierta desde…), sucursal, usuario, conexión y ayuda de atajos. */
@Component({
  selector: 'app-pos-header',
  imports: [RouterLink, HasPermissionDirective],
  template: `
    <header class="bg-surface border-b border-line px-3 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      <a routerLink="/app" class="pos-link">
        <i class="pi pi-arrow-left text-xs" aria-hidden="true"></i>Menú
      </a>
      <span class="font-semibold truncate max-w-56">{{ businessName() }}</span>

      @if (session(); as s) {
        <span class="inline-flex items-center gap-1.5 rounded-full bg-success-soft text-success-soft-fg px-2.5 py-0.5 text-sm"
              [title]="'Abierta por ' + (s.openedByName ?? userName())">
          <i class="pi pi-lock-open text-xs" aria-hidden="true"></i>
          Caja abierta <span class="hidden sm:inline">{{ since() }}</span>
        </span>
        <span class="text-sm text-muted truncate">
          {{ s.registerCode }} · {{ s.branchName }}<span class="hidden lg:inline"> · {{ userName() }}</span>
        </span>
      } @else if (session() === null) {
        <span class="inline-flex items-center gap-1.5 rounded-full bg-warning-soft text-warning-soft-fg px-2.5 py-0.5 text-sm">
          <i class="pi pi-lock text-xs" aria-hidden="true"></i>Caja cerrada
        </span>
      }

      <span class="flex-1"></span>

      <span role="status" class="inline-flex items-center gap-1.5 text-sm"
            [class.text-muted]="online()" [class.text-danger]="!online()">
        <span class="size-2 rounded-full" [class.bg-success]="online()" [class.bg-danger]="!online()" aria-hidden="true"></span>
        {{ online() ? 'En línea' : 'Sin conexión' }}
      </span>
      <a routerLink="/app/caja" class="pos-link">Caja</a>
      <a *hasPermission="'sales:read'" routerLink="/app/ventas" class="pos-link">Ventas</a>
      <button type="button" class="pos-link" data-tour="pos-help" aria-label="Atajos de teclado" title="Atajos de teclado (?)"
              (click)="help.emit()">
        <i class="pi pi-question-circle" aria-hidden="true"></i>
      </button>
    </header>
  `,
  styles: `
    .pos-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      min-height: 2.75rem;
      min-width: 2.75rem;
      padding: 0 0.5rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    .pos-link:hover {
      color: var(--text);
      background: var(--surface-alt);
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
