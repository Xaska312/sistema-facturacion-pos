import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CREDIT_METHOD_CODE, PaymentMethod } from '../../core/api/api.models';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatCop } from '../../shared/money';
import { newPaymentLine, summarizeLines } from './payment-lines';
import { methodLabel } from './pos-labels';
import { PaymentDraft } from './sale-math';

/**
 * Cómo paga el cliente, con uno o varios medios (decisión 261): por ejemplo, una parte en efectivo y el resto fiado.
 * Lo usan la entrega de un pedido y la venta de una cotización. El padre valida con {@code paymentLinesProblem}.
 */
@Component({
  selector: 'app-payment-lines',
  imports: [FormsModule, ButtonModule, InputTextModule, PesosInputDirective],
  template: `
    <fieldset class="flex flex-col gap-2">
      <legend class="text-sm font-medium mb-1">Cómo paga</legend>
      @for (line of lines(); track $index; let i = $index) {
        <div class="flex flex-col gap-2 border rounded-lg p-2">
          <div class="flex flex-wrap gap-2 items-end">
            <label class="flex flex-col gap-1 flex-1 min-w-36">
              <span class="text-xs font-medium">Medio</span>
              <select class="h-11 border rounded-lg px-2" [ngModel]="line.methodId" (ngModelChange)="setMethod(i, $event)">
                <option value="" disabled>Elige…</option>
                @for (m of methods(); track m.id) {
                  <option [value]="m.id">{{ label(m) }}</option>
                }
              </select>
            </label>
            <label class="flex flex-col gap-1 w-40">
              <span class="text-xs font-medium">{{ line.affectsCash ? 'Recibe' : 'Valor' }}</span>
              <input appPesos class="h-11 border rounded-lg px-3 text-right tabular-nums" [ngModel]="line.amount"
                     (ngModelChange)="setAmount(i, $event)" />
            </label>
            @if (lines().length > 1) {
              <p-button icon="pi pi-trash" severity="danger" [text]="true" styleClass="min-h-11"
                        [attr.aria-label]="'Quitar el pago ' + (i + 1)" (onClick)="remove(i)" />
            }
          </div>
          @if (needsReference(line)) {
            <label class="flex flex-col gap-1">
              <span class="text-xs font-medium">
                Referencia
                @if (!method(line)?.requiresReference) {
                  <span class="text-muted font-normal">(opcional)</span>
                }
              </span>
              <input pInputText maxlength="60" [ngModel]="line.reference" (ngModelChange)="setReference(i, $event)" />
            </label>
          }
          @if (isCredit(line)) {
            <small class="text-xs text-muted">Queda fiado al cliente. Cupo disponible {{ cop(creditAvailable() ?? 0) }}.</small>
          }
        </div>
      }
      <div class="flex flex-wrap items-center justify-between gap-2">
        @if (lines().length < methods().length) {
          <p-button label="Agregar otro medio" icon="pi pi-plus" size="small" [text]="true" (onClick)="add()" />
        }
        <span class="text-sm tabular-nums ml-auto">
          @if (summary().missing > 0) {
            <span class="text-warning font-medium">Faltan {{ cop(summary().missing) }}</span>
          } @else if (summary().change > 0) {
            <span class="font-semibold">Cambio {{ cop(summary().change) }}</span>
          } @else {
            <span class="text-muted">Pagado {{ cop(summary().paid) }}</span>
          }
        </span>
      </div>
    </fieldset>
  `,
})
export class PaymentLinesComponent {
  /** Lo que debe pagar el cliente. */
  readonly total = input.required<number>();
  /** Medios que se pueden usar (sin Anticipo; Fiado solo si el cliente tiene cupo). */
  readonly methods = input.required<PaymentMethod[]>();
  /** Cupo de fiado disponible del cliente (null si no puede fiar). */
  readonly creditAvailable = input<number | null>(null);
  readonly lines = model.required<PaymentDraft[]>();

  protected readonly summary = computed(() => summarizeLines(this.total(), this.lines()));
  protected readonly cop = formatCop;

  protected label(method: PaymentMethod): string {
    return methodLabel(method.code, method.name);
  }

  protected method(line: PaymentDraft): PaymentMethod | undefined {
    return this.methods().find((m) => m.id === line.methodId);
  }

  protected isCredit(line: PaymentDraft): boolean {
    return this.method(line)?.code === CREDIT_METHOD_CODE;
  }

  protected needsReference(line: PaymentDraft): boolean {
    const method = this.method(line);
    return !!method && !method.affectsCash && method.code !== CREDIT_METHOD_CODE;
  }

  private patch(index: number, change: Partial<PaymentDraft>): void {
    this.lines.update((list) => list.map((l, i) => (i === index ? { ...l, ...change } : l)));
  }

  setMethod(index: number, methodId: string): void {
    const method = this.methods().find((m) => m.id === methodId);
    this.patch(index, { methodId, affectsCash: method?.affectsCash ?? false });
  }

  setAmount(index: number, amount: number | null): void {
    this.patch(index, { amount });
  }

  setReference(index: number, reference: string): void {
    this.patch(index, { reference });
  }

  /** Agrega un medio que no se haya usado, con lo que falta. */
  add(): void {
    const used = new Set(this.lines().map((l) => l.methodId));
    const next = this.methods().find((m) => !used.has(m.id));
    this.lines.update((list) => [...list, newPaymentLine(next, this.summary().missing)]);
  }

  remove(index: number): void {
    this.lines.update((list) => list.filter((_, i) => i !== index));
  }
}
