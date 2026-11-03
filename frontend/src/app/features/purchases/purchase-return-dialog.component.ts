import { Component, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, tap } from 'rxjs';
import { PurchaseReceipt, PurchasesApi } from '../../core/api/purchases.api';
import { newIdempotencyKey } from '../../core/api/sales.api';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { formatCop, formatQuantity } from '../../shared/money';
import { ReturnDraft, returnDrafts, returnProblem, returnTotal } from './purchase-text';

/**
 * Devolución al proveedor (Fase 13-3, decisión 281): de cada línea aceptada se devuelve hasta lo recibido menos lo ya
 * devuelto. Sale del lote recibido y su valor (costo de la factura con IVA) baja lo que se le debe al proveedor.
 */
@Component({
  selector: 'app-purchase-return-dialog',
  imports: [FormsModule, InputTextModule, FormDialogComponent],
  template: `
    @if (receipt(); as r) {
      <app-form-dialog [(visible)]="visible" [header]="'Devolver a ' + (r.summary.supplierName ?? 'proveedor')"
                       width="40rem" submitLabel="Registrar devolución" [dirty]="dirty()" [invalidMessage]="problem()"
                       [save]="saveRequest" [successMessage]="null" (saved)="returned.emit($any($event))">
        <p class="text-sm text-muted">Escribe cuánto devuelves de cada producto (en la unidad en que llegó). Sale del
          inventario de su lote y se descuenta de lo que le debes.</p>
        <div class="flex flex-col gap-2">
          @for (d of drafts(); track d.lineNo) {
            <label class="grid grid-cols-[1fr_7rem] gap-2 items-center text-sm border-t pt-2">
              <span>{{ d.productName }}
                <span class="block text-xs text-muted">{{ d.lotNumber ? 'Lote ' + d.lotNumber + ' · ' : '' }}puedes devolver
                  {{ q(d.max) }} {{ d.unitCode }}</span></span>
              <input pInputText type="number" min="0" [max]="d.max" step="any" [(ngModel)]="d.quantity"
                     [attr.aria-label]="'Cantidad a devolver de ' + d.productName" />
            </label>
          }
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Motivo</span>
          <input pInputText maxlength="255" [(ngModel)]="reason"
                 placeholder="Vencido, averiado, retiro del mercado, no era lo pedido…" />
        </label>
        <p class="text-sm text-right">Valor a descontar <strong class="tabular-nums">{{ cop(total()) }}</strong></p>
      </app-form-dialog>
    }
  `,
})
export class PurchaseReturnDialogComponent {
  private readonly api = inject(PurchasesApi);

  readonly visible = model(false);
  readonly returned = output<PurchaseReceipt>();

  protected readonly receipt = signal<PurchaseReceipt | null>(null);
  protected readonly drafts = signal<ReturnDraft[]>([]);
  protected reason = '';
  private idempotencyKey = '';
  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;

  open(receipt: PurchaseReceipt): void {
    this.receipt.set(receipt);
    this.drafts.set(returnDrafts(receipt.lines));
    this.reason = '';
    this.idempotencyKey = newIdempotencyKey('devolucion');
    this.visible.set(true);
  }

  protected total(): number {
    return returnTotal(this.drafts());
  }

  protected dirty(): boolean {
    return this.reason.trim() !== '' || this.drafts().some((d) => Number(d.quantity) > 0);
  }

  protected problem(): string | null {
    return returnProblem(this.drafts(), this.reason);
  }

  protected readonly saveRequest = (): Observable<PurchaseReceipt> =>
    this.api.returnGoods(this.receipt()!.summary.id, {
      reason: this.reason.trim(),
      lines: this.drafts().filter((d) => Number(d.quantity) > 0)
        .map((d) => ({ receiptLineNo: d.lineNo, quantity: Number(d.quantity) })),
    }, this.idempotencyKey).pipe(tap(() => (this.idempotencyKey = newIdempotencyKey('devolucion'))));
}
