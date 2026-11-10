import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RecurringDueSummary, RecurringExpensesApi } from '../../core/api/expenses.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { formatCop } from '../../shared/money';
import { dueHeadline, dueLabel } from './recurring-text';

/**
 * Aviso de Inicio (decisión 321): gastos fijos vencidos o de esta semana, con acceso a Gastos para pagarlos. No
 * muestra nada si no hay, si no se tiene expenses:read o si la consulta falla.
 */
@Component({
  selector: 'app-recurring-alert',
  imports: [RouterLink],
  template: `
    @if (summary(); as s) {
      @if (s.count > 0) {
        <section class="card p-4 flex flex-wrap items-start gap-3" role="status" aria-label="Gastos fijos por pagar">
          <i class="pi pi-replay text-xl mt-0.5" [class.text-danger]="s.overdueCount > 0"
             [class.text-warning]="s.overdueCount === 0" aria-hidden="true"></i>
          <div class="flex-1 min-w-48 text-sm">
            <p><strong [class.text-danger]="s.overdueCount > 0">{{ headline(s) }}</strong></p>
            <ul class="text-xs text-muted mt-1">
              @for (item of s.items.slice(0, 3); track item.recurringId + item.dueDate) {
                <li>{{ item.name }} · {{ cop(item.amount) }} · {{ due(item) }}</li>
              }
              @if (s.count > 3) { <li>y {{ s.count - 3 }} más</li> }
            </ul>
          </div>
          <a class="text-brand font-medium hover:underline text-sm" routerLink="/app/gastos">Ver y pagar</a>
        </section>
      }
    }
  `,
})
export class RecurringAlertComponent implements OnInit {
  private readonly api = inject(RecurringExpensesApi);
  private readonly canRead = permissionFlag('expenses:read');
  protected readonly summary = signal<RecurringDueSummary | null>(null);
  protected readonly headline = dueHeadline;
  protected readonly due = dueLabel;
  protected readonly cop = formatCop;

  ngOnInit(): void {
    if (this.canRead()) {
      this.api.due().subscribe({ next: (s) => this.summary.set(s), error: () => undefined });
    }
  }
}
