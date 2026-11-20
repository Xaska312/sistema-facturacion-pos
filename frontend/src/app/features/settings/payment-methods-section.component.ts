import { Component, OnInit, inject, input, signal } from '@angular/core';
import { CashApi, OptionalPaymentMethod } from '../../core/api/cash.api';
import { problemMessage } from '../../core/errors/problem';
import { ToastService } from '../../shared/ui/toast.service';

/** Qué dice cada medio opcional (decisión 366). */
const HINTS: Record<string, string> = {
  ADDI: 'Si eres aliado de Addi: el cliente aprueba su crédito en Addi y aquí registras la venta con la referencia que te da.',
  SISTECREDITO: 'Si eres aliado de Sistecrédito: el cliente aprueba su crédito con ellos y aquí registras la venta con la referencia de la compra.',
};

/**
 * Medios de pago opcionales (decisión 366): Addi y Sistecrédito. Prendidos salen al cobrar, piden referencia y no entran
 * al efectivo de la caja; en el cierre y en los reportes salen aparte.
 */
@Component({
  selector: 'app-payment-methods-section',
  template: `
    <section class="card p-5 mt-6 max-w-3xl" aria-labelledby="pm-title">
      <h2 id="pm-title" class="text-base font-bold tracking-tight">Otros medios de pago</h2>
      <p class="text-sm text-muted mt-1">
        Prende los que aceptas en tu negocio. Salen al cobrar, piden la referencia y no entran al efectivo de la caja:
        en el cierre y en los reportes se ven aparte, para que cuadres lo que te consignan.
      </p>
      <ul class="flex flex-col gap-3 mt-4">
        @for (m of methods(); track m.id) {
          <li class="pm-row">
            <label class="flex items-start gap-3 flex-1 cursor-pointer">
              <input type="checkbox" class="mt-1" [checked]="m.active" [disabled]="!canEdit() || busy() === m.id"
                     (change)="toggle(m, $any($event.target).checked)" />
              <span>
                <span class="block font-semibold">{{ m.name }}</span>
                <span class="block text-xs text-muted">{{ hint(m.code) }}</span>
              </span>
            </label>
          </li>
        } @empty {
          <li class="text-sm text-muted">Cargando…</li>
        }
      </ul>
    </section>
  `,
  styles: `
    .pm-row { display: flex; padding: 0.75rem 0.875rem; border-radius: 0.875rem; border: 1px solid var(--line); }
  `,
})
export class PaymentMethodsSectionComponent implements OnInit {
  private readonly api = inject(CashApi);
  private readonly messages = inject(ToastService);

  readonly canEdit = input(false);
  protected readonly methods = signal<OptionalPaymentMethod[]>([]);
  protected readonly busy = signal<string | null>(null);

  ngOnInit(): void {
    this.api.optionalPaymentMethods().subscribe({ next: (list) => this.methods.set(list), error: () => undefined });
  }

  protected hint(code: string): string {
    return HINTS[code] ?? '';
  }

  protected toggle(m: OptionalPaymentMethod, active: boolean): void {
    this.busy.set(m.id);
    this.api.setPaymentMethodActive(m.id, active).subscribe({
      next: (list) => {
        this.busy.set(null);
        this.methods.set(list);
        this.messages.add({ severity: 'success', summary: active ? `${m.name} activado` : `${m.name} apagado`,
          detail: active ? 'Ya sale al cobrar.' : 'Ya no sale al cobrar; las ventas anteriores no cambian.' });
      },
      error: (e: unknown) => {
        this.busy.set(null);
        this.methods.set([...this.methods()]);
        this.messages.add({ severity: 'error', summary: 'No se guardó', detail: problemMessage(e) });
      },
    });
  }
}
