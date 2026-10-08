import { Component, OnInit, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { CashSession, RegisterOption } from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { permissionFlag } from '../../core/auth/permission-flag';

/**
 * Apertura guiada desde el POS: elegir la caja (si hay más de una libre), contar la base de efectivo y "Abrir caja",
 * todo en la misma pantalla. Sin cash:operate se explica a quién pedirlo.
 */
@Component({
  selector: 'app-open-cash',
  imports: [FormsModule, PesosInputDirective, RouterLink, ButtonModule, SkeletonModule],
  template: `
    <section class="card w-full max-w-xl p-6 flex flex-col gap-5" aria-labelledby="open-cash-title">
      <div class="flex items-start gap-3">
        <span class="size-12 shrink-0 rounded-full bg-brand-soft text-brand-soft-fg inline-flex items-center justify-center">
          <i class="pi pi-wallet text-xl" aria-hidden="true"></i>
        </span>
        <div>
          <h1 id="open-cash-title" class="text-xl font-semibold">No tienes una caja abierta</h1>
          <p class="text-muted">
            {{ canOperate() ? 'Cuenta el efectivo con el que empiezas y abre la caja para vender.' : 'Para vender necesitas una caja abierta.' }}
          </p>
        </div>
      </div>

      @if (!canOperate()) {
        <p class="text-sm">Tu usuario no puede abrir cajas. Pide a un administrador que te asigne el permiso
          "Abrir, mover y cerrar caja".</p>
        <a routerLink="/app" class="text-brand font-medium">Volver al menú</a>
      } @else if (registers() === null) {
        <p-skeleton height="4.5rem" borderRadius="0.75rem" />
      } @else if (registers()!.length === 0) {
        <p class="text-sm" role="alert">No hay cajas disponibles en tus sucursales. Pide a un administrador que cree una
          en Configuración → Cajas.</p>
      } @else {
        @if (registers()!.length > 1) {
          <fieldset class="flex flex-col gap-2">
            <legend class="text-sm font-medium mb-1">Caja</legend>
            <div class="grid gap-2 sm:grid-cols-2">
              @for (r of registers(); track r.id) {
                <button type="button" class="register text-left" [disabled]="r.busy"
                        [attr.aria-pressed]="registerId() === r.id" (click)="registerId.set(r.id)">
                  <span class="block font-medium">{{ r.code }} · {{ r.name }}</span>
                  <span class="block text-sm text-muted">{{ r.branchName }}</span>
                  @if (r.busy) {
                    <span class="block text-xs text-warning">Abierta por {{ r.busyBy ?? 'otro usuario' }}</span>
                  }
                </button>
              }
            </div>
          </fieldset>
        } @else {
          <p class="text-sm"><span class="text-muted">Caja:</span>
            <span class="font-medium"> {{ registers()![0].code }} · {{ registers()![0].name }}</span>
            <span class="text-muted"> · {{ registers()![0].branchName }}</span></p>
        }

        <form class="flex flex-col gap-4" (ngSubmit)="open()">
          <div class="flex flex-col gap-1">
            <label for="opening-amount" class="font-medium">Base de efectivo</label>
            <input id="opening-amount" name="openingAmount" appPesos
                   class="h-14 border rounded-xl px-4 text-2xl text-right" [(ngModel)]="openingAmount"
                   aria-describedby="opening-hint" />
            <span id="opening-hint" class="text-sm text-muted">El dinero que hay en el cajón antes de la primera venta.</span>
          </div>
          <p-button type="submit" label="Abrir caja" icon="pi pi-lock-open" size="large" styleClass="w-full min-h-14 text-lg"
                    [disabled]="!registerId() || openingAmount === null || openingAmount < 0" [loading]="saving()" />
        </form>
      }
    </section>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      padding: 1rem;
    }
    .register {
      min-height: 3.5rem;
      padding: 0.75rem;
      border-radius: 0.75rem;
      border: 1px solid var(--surface-border);
      background: var(--surface);
    }
    .register[aria-pressed='true'] {
      border-color: var(--brand);
      background: var(--brand-soft);
    }
    .register:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  `,
})
export class OpenCashComponent implements OnInit {
  private readonly cash = inject(CashApi);
  private readonly messages = inject(MessageService);
  protected readonly canOperate = permissionFlag('cash:operate');

  readonly opened = output<CashSession>();

  /** {@code null} mientras carga. */
  protected readonly registers = signal<RegisterOption[] | null>(null);
  protected readonly registerId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected openingAmount: number | null = 0;

  ngOnInit(): void {
    if (!this.canOperate()) {
      return;
    }
    this.cash.registers().subscribe({
      next: (list) => {
        this.registers.set(list);
        const free = list.filter((r) => !r.busy);
        this.registerId.set(free.length === 1 ? free[0].id : null);
        setTimeout(() => document.getElementById('opening-amount')?.focus(), 0);
      },
      error: () => this.registers.set([]),
    });
  }

  open(): void {
    const registerId = this.registerId();
    if (!registerId || this.openingAmount === null || this.openingAmount < 0 || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.cash.open(registerId, Number(this.openingAmount), null).subscribe({
      next: (session) => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: 'Caja abierta', detail: 'Ya puedes vender.' });
        this.opened.emit(session);
      },
      error: () => {
        this.saving.set(false);
        // Otra persona pudo abrir esa caja: se recarga la lista.
        this.ngOnInit();
      },
    });
  }
}
