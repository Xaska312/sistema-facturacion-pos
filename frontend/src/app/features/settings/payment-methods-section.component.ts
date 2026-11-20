import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CashApi, OptionalPaymentMethod } from '../../core/api/cash.api';
import { problemMessage } from '../../core/errors/problem';
import { ButtonComponent } from '../../shared/ui/button.component';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { ToastService } from '../../shared/ui/toast.service';

/** Qué dice cada medio que trae XASKA (decisión 366). */
const HINTS: Record<string, string> = {
  ADDI: 'El cliente aprueba su crédito en Addi y aquí registras la venta con la referencia que te da.',
  SISTECREDITO: 'El cliente aprueba su crédito con Sistecrédito y aquí registras la venta con la referencia de la compra.',
};

/** Ideas para agregar con un toque (decisión 367). Nequi, Daviplata y Bre-B ya van en "Transferencia". */
export const PAYMENT_SUGGESTIONS: readonly string[] = ['SU+ Pay', 'Bold', 'Mercado Pago', 'Wompi', 'Bonos de regalo'];

/**
 * Otros medios de pago (decisiones 366 y 367): Addi y Sistecrédito vienen listos para prender, y el negocio agrega los
 * que use. Prendidos salen al cobrar y no entran al efectivo de la caja; en el cierre y en los reportes salen aparte.
 */
@Component({
  selector: 'app-payment-methods-section',
  imports: [FormsModule, ButtonComponent, AppInputDirective],
  template: `
    <section class="card p-5 mt-6 max-w-3xl" aria-labelledby="pm-title">
      <h2 id="pm-title" class="text-base font-bold tracking-tight">Otros medios de pago</h2>
      <p class="text-sm text-muted mt-1">
        Efectivo, tarjeta, transferencia (Nequi, Daviplata, Bre-B) y fiado ya vienen. Prende los demás que aceptes o
        agrega el tuyo: salen al cobrar y no entran al efectivo de la caja; en el cierre y en los reportes se ven aparte,
        para que cuadres lo que te consignan.
      </p>
      <ul class="flex flex-col gap-2 mt-4">
        @for (m of methods(); track m.id) {
          <li class="pm-row">
            <label class="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
              <input type="checkbox" class="mt-1" [checked]="m.active" [disabled]="!canEdit() || busy() === m.id"
                     (change)="update(m, { active: $any($event.target).checked })" />
              <span class="min-w-0">
                @if (renaming() === m.id) {
                  <span class="flex flex-wrap items-center gap-2">
                    <input appInput class="max-w-56" maxlength="40" [(ngModel)]="newName" [name]="'rename-' + m.id"
                           [attr.aria-label]="'Nuevo nombre de ' + m.name" (keydown.enter)="saveName(m)" />
                    <app-button label="Guardar" size="small" [loading]="busy() === m.id" (clicked)="saveName(m)" />
                    <app-button label="Cancelar" size="small" [text]="true" severity="secondary" (clicked)="renaming.set(null)" />
                  </span>
                } @else {
                  <span class="block font-semibold">{{ m.name }}</span>
                }
                <span class="block text-xs text-muted">{{ hint(m) }}</span>
              </span>
            </label>
            @if (m.custom && canEdit() && renaming() !== m.id) {
              <div class="flex flex-wrap items-center gap-3 text-sm">
                <label class="flex items-center gap-1.5">
                  <input type="checkbox" [checked]="m.requiresReference" [disabled]="busy() === m.id"
                         (change)="update(m, { requiresReference: $any($event.target).checked })" />
                  Pide referencia
                </label>
                <app-button label="Cambiar nombre" size="small" [text]="true" severity="secondary" (clicked)="startRename(m)" />
              </div>
            }
          </li>
        } @empty {
          <li class="text-sm text-muted">Cargando…</li>
        }
      </ul>

      @if (canEdit()) {
        <form class="mt-5 flex flex-col gap-2" (ngSubmit)="create()">
          <label for="pm-new" class="text-sm font-semibold">Agregar otro medio de pago</label>
          <div class="flex flex-wrap gap-2">
            @for (s of suggestions(); track s) {
              <button type="button" class="pm-chip" (click)="draft = s">{{ s }}</button>
            }
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <input appInput id="pm-new" name="pm-new" class="max-w-64" maxlength="40" placeholder="Ej.: SU+ Pay"
                   [(ngModel)]="draft" />
            <label class="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="pm-ref" [(ngModel)]="draftReference" /> Pedir referencia al cobrar
            </label>
            <app-button type="submit" label="Agregar" icon="pi pi-plus" [loading]="creating()"
                        [disabled]="draft.trim().length < 2" />
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .pm-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; padding: 0.75rem 0.875rem;
      border-radius: 0.875rem; border: 1px solid var(--line); }
    .pm-chip { min-height: 2.25rem; padding: 0 0.875rem; border-radius: 9999px; border: 1px solid var(--line);
      background: var(--surface); font-size: 0.8125rem; font-weight: 600; }
    .pm-chip:hover { border-color: var(--brand); background: var(--brand-soft); }
  `,
})
export class PaymentMethodsSectionComponent implements OnInit {
  private readonly api = inject(CashApi);
  private readonly messages = inject(ToastService);

  readonly canEdit = input(false);
  protected readonly methods = signal<OptionalPaymentMethod[]>([]);
  protected readonly busy = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly renaming = signal<string | null>(null);
  protected draft = '';
  protected draftReference = true;
  protected newName = '';

  ngOnInit(): void {
    this.api.optionalPaymentMethods().subscribe({ next: (list) => this.methods.set(list), error: () => undefined });
  }

  /** Las ideas que aún no están en la lista. */
  protected suggestions(): string[] {
    const have = new Set(this.methods().map((m) => m.name.toLowerCase()));
    return PAYMENT_SUGGESTIONS.filter((s) => !have.has(s.toLowerCase()));
  }

  protected hint(m: OptionalPaymentMethod): string {
    return HINTS[m.code] ?? (m.requiresReference ? 'Medio de tu negocio. Al cobrar pide la referencia.'
      : 'Medio de tu negocio. La referencia es opcional.');
  }

  protected startRename(m: OptionalPaymentMethod): void {
    this.newName = m.name;
    this.renaming.set(m.id);
  }

  protected saveName(m: OptionalPaymentMethod): void {
    const name = this.newName.trim();
    if (!name || name === m.name) {
      this.renaming.set(null);
      return;
    }
    this.update(m, { name }, () => this.renaming.set(null));
  }

  protected update(m: OptionalPaymentMethod, change: { active?: boolean; name?: string; requiresReference?: boolean },
                   done?: () => void): void {
    this.busy.set(m.id);
    this.api.updatePaymentMethod(m.id, change).subscribe({
      next: (list) => {
        this.busy.set(null);
        this.methods.set(list);
        done?.();
        if (change.active !== undefined) {
          this.messages.add({ severity: 'success', summary: change.active ? `${m.name} activado` : `${m.name} apagado`,
            detail: change.active ? 'Ya sale al cobrar.' : 'Ya no sale al cobrar; las ventas anteriores no cambian.' });
        }
      },
      error: (e: unknown) => {
        this.busy.set(null);
        this.methods.set([...this.methods()]);
        this.messages.add({ severity: 'error', summary: 'No se guardó', detail: problemMessage(e) });
      },
    });
  }

  protected create(): void {
    const name = this.draft.trim();
    if (name.length < 2) {
      return;
    }
    this.creating.set(true);
    this.api.createPaymentMethod(name, this.draftReference).subscribe({
      next: (list) => {
        this.creating.set(false);
        this.methods.set(list);
        this.draft = '';
        this.draftReference = true;
        this.messages.add({ severity: 'success', summary: `${name} agregado`, detail: 'Ya sale al cobrar.' });
      },
      error: (e: unknown) => {
        this.creating.set(false);
        this.messages.add({ severity: 'error', summary: 'No se agregó', detail: problemMessage(e) });
      },
    });
  }
}
