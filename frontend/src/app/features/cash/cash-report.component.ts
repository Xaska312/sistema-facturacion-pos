import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { CashReport } from '../../core/api/api.models';
import { formatCop } from '../../shared/money';
import { differenceLabel } from './labels';

/** Informe de caja: parcial (X) con la sesión abierta o de cierre (Z). */
@Component({
  selector: 'app-cash-report',
  imports: [DatePipe],
  template: `
    @let r = report();
    <div class="text-sm space-y-3">
      <div>
        <p class="font-medium">
          Informe {{ r.session.status === 'OPEN' ? 'parcial (X)' : 'de cierre (Z)' }} · {{ r.session.registerCode }}
          · {{ r.session.branchName }}
        </p>
        <p class="text-muted">
          Abrió {{ r.session.openedByName }} el {{ r.session.openedAt | date: 'short' }}
          @if (r.session.closedAt) {
            · cerró {{ r.session.closedByName }} el {{ r.session.closedAt | date: 'short' }}
          }
        </p>
      </div>

      <section>
        <p class="font-medium mb-1">Ventas</p>
        <p class="flex justify-between"><span>Ventas registradas ({{ r.salesCount }})</span><span>{{ cop(r.salesTotal) }}</span></p>
        <p class="flex justify-between"><span>Anuladas ({{ r.voidedCount }})</span><span>-{{ cop(r.voidedTotal) }}</span></p>
        <p class="flex justify-between font-medium"><span>Ventas netas</span><span>{{ cop(r.netSales) }}</span></p>
        @for (m of r.byMethod; track m.paymentMethodId) {
          <p class="flex justify-between pl-3 text-muted"><span>{{ m.name }} ({{ m.count }})</span><span>{{ cop(m.amount) }}</span></p>
        }
        @if (r.voidedAfterCloseCount > 0) {
          <p class="text-muted">
            Anuladas después del cierre ({{ r.voidedAfterCloseCount }}): {{ cop(r.voidedAfterCloseTotal) }}. No cambian
            este cierre; el efectivo se devolvió desde otra caja.
          </p>
        }
        @if (r.voidsHereCount > 0) {
          <p class="text-muted">Anulaciones con devolución de efectivo en esta caja: {{ r.voidsHereCount }}</p>
        }
      </section>

      <section>
        <p class="font-medium mb-1">Efectivo</p>
        <p class="flex justify-between"><span>Base de apertura</span><span>{{ cop(r.cash.opening) }}</span></p>
        <p class="flex justify-between"><span>Ventas en efectivo</span><span>{{ cop(r.cash.sales) }}</span></p>
        <p class="flex justify-between"><span>Devoluciones por anulación</span><span>{{ cop(r.cash.voidRefunds) }}</span></p>
        <p class="flex justify-between"><span>Ingresos</span><span>{{ cop(r.cash.incomes) }}</span></p>
        <p class="flex justify-between"><span>Egresos</span><span>{{ cop(r.cash.expenses) }}</span></p>
        <p class="flex justify-between"><span>Retiros</span><span>{{ cop(r.cash.withdrawals) }}</span></p>
        @if (r.auditView) {
          <p class="flex justify-between font-medium border-t mt-1 pt-1"><span>Esperado</span><span>{{ cop(r.cash.expected) }}</span></p>
        }
        @if (r.cash.counted !== null) {
          <p class="flex justify-between font-medium"><span>Contado</span><span>{{ cop(r.cash.counted) }}</span></p>
        }
        @if (r.auditView && r.cash.difference !== null) {
          <p class="flex justify-between font-semibold" [class.text-danger]="r.cash.difference < 0"
             [class.text-success]="r.cash.difference > 0">
            <span>{{ difference(r.cash.difference) }}</span><span>{{ cop(r.cash.difference) }}</span>
          </p>
        }
        @if (!r.auditView) {
          <p class="text-xs text-muted mt-1">El efectivo esperado y la diferencia los revisa el administrador.</p>
        }
      </section>
      @if (r.session.closingNotes) {
        <p><span class="font-medium">Notas:</span> {{ r.session.closingNotes }}</p>
      }
    </div>
  `,
})
export class CashReportComponent {
  readonly report = input.required<CashReport>();
  protected readonly cop = formatCop;
  protected readonly difference = differenceLabel;
}
