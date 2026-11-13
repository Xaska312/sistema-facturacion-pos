import { Component, computed, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { Observable } from 'rxjs';
import { Branch, Party, PaymentMethod } from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import {
  ExpenseCategory,
  ExpensesApi,
  RecurringExpense,
  RecurringExpensesApi,
  RecurringFrequency,
} from '../../core/api/expenses.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { PartiesApi } from '../../core/api/parties.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatCop } from '../../shared/money';
import { formatDay } from '../orders/order-text';
import { methodLabel } from '../pos/pos-labels';
import { businessToday, isoDate } from '../reports/periods';
import { expenseMethods } from './expense-text';
import { frequencyLabel, recurringProblem } from './recurring-text';

/**
 * Gastos fijos (decisión 321): la lista con lo que se paga cada mes o cada quincena, y el formulario para crear,
 * cambiar o apagar uno. No se borran: uno apagado deja de avisar y lo que ya se pagó queda en Gastos.
 */
@Component({
  selector: 'app-recurring-expenses-dialog',
  imports: [FormsModule, ButtonModule, DialogModule, AppInputDirective, PesosInputDirective, FormDialogComponent],
  template: `
    <p-dialog header="Gastos fijos" [(visible)]="visible" [modal]="true" [style]="{ width: '40rem' }"
              [breakpoints]="{ '640px': '96vw' }" (onHide)="changed.emit()">
      <p class="text-sm text-muted mb-3">Lo que pagas siempre, como el arriendo, la nómina o el internet. XASKA te avisa
        cuando toca y lo registras con un toque.</p>
      @if (canManage()) {
        <p-button label="Nuevo gasto fijo" icon="pi pi-plus" class="block mb-3" (onClick)="openForm(null)" />
      }
      <ul class="flex flex-col">
        @for (r of items(); track r.id) {
          <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 border-t border-line first:border-t-0">
            <div class="flex-1 min-w-48" [class.text-muted]="!r.active">
              <p class="font-medium">{{ r.name }}
                @if (!r.active) { <span class="text-xs font-normal">· apagado</span> }</p>
              <p class="text-xs text-muted">{{ frequency(r) }} · {{ r.categoryName }} · {{ r.paymentMethodName }}</p>
              @if (r.nextDue) { <p class="text-xs text-muted">Próximo pago: {{ day(r.nextDue) }}</p> }
            </div>
            <span class="font-semibold tabular-nums">{{ cop(r.amount) }}</span>
            @if (canManage()) {
              <p-button icon="pi pi-pencil" size="small" [text]="true" severity="secondary"
                        [ariaLabel]="'Cambiar ' + r.name" (onClick)="openForm(r)" />
              <p-button [label]="r.active ? 'Apagar' : 'Prender'" size="small" [text]="true"
                        [severity]="r.active ? 'secondary' : 'primary'" [loading]="toggling() === r.id"
                        (onClick)="toggle(r)" />
            }
          </li>
        } @empty {
          <li class="py-6 text-center text-sm text-muted">{{ loaded() ? 'Aún no tienes gastos fijos.' : 'Cargando…' }}</li>
        }
      </ul>
    </p-dialog>

    <app-form-dialog [(visible)]="formOpen" [header]="editing() ? 'Cambiar gasto fijo' : 'Nuevo gasto fijo'"
                     width="32rem" [submitLabel]="editing() ? 'Guardar' : 'Crear gasto fijo'" [dirty]="formDirty"
                     [invalidMessage]="problem()" [save]="saveRequest" [successMessage]="null" (saved)="onSaved()">
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Nombre</span>
        <input appInput name="name" maxlength="80" [(ngModel)]="name" (ngModelChange)="formDirty = true"
               placeholder="Ej.: Arriendo del local" />
      </label>
      <div class="flex flex-col gap-1">
        <label for="recurring-amount" class="text-sm font-medium">Valor de cada pago</label>
        <input id="recurring-amount" appPesos class="h-12 border rounded-lg px-3 text-xl text-right tabular-nums"
               name="amount" [(ngModel)]="amount" (ngModelChange)="formDirty = true" />
        <small class="text-xs text-muted">Si cambia algún mes, lo ajustas al pagarlo.</small>
      </div>
      <fieldset class="flex flex-col gap-1">
        <legend class="text-sm font-medium mb-1">Cada cuánto se paga</legend>
        <div class="flex flex-wrap gap-2">
          @for (f of frequencies; track f.value) {
            <label class="flex items-center gap-2 min-h-11 px-3 border rounded-lg cursor-pointer"
                   [class.border-brand]="frequencyValue === f.value">
              <input type="radio" name="frequency" [value]="f.value" [(ngModel)]="frequencyValue"
                     (ngModelChange)="formDirty = true" />
              {{ f.label }}
            </label>
          }
        </div>
        @if (frequencyValue === 'MONTHLY') {
          <label class="flex items-center gap-2 text-sm mt-1">
            <span>El día</span>
            <input type="number" name="day" min="1" max="31" class="w-20 h-11 border rounded-lg px-2 text-right"
                   [(ngModel)]="dayOfMonth" (ngModelChange)="formDirty = true" />
            <span class="text-muted">de cada mes</span>
          </label>
        } @else {
          <small class="text-xs text-muted">El 15 y el último día de cada mes.</small>
        }
      </fieldset>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Categoría</span>
        <select class="border rounded-lg px-2 h-11" name="category" [(ngModel)]="categoryId" (ngModelChange)="formDirty = true">
          <option value="">Elige…</option>
          @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
        </select>
      </label>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Se paga con</span>
          <select class="border rounded-lg px-2 h-11" name="method" [(ngModel)]="methodId" (ngModelChange)="formDirty = true">
            <option value="">Elige…</option>
            @for (m of methods(); track m.id) { <option [value]="m.id">{{ label(m) }}</option> }
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Sede</span>
          <select class="border rounded-lg px-2 h-11" name="branch" [(ngModel)]="branchId" (ngModelChange)="formDirty = true">
            @if (branches().length !== 1) { <option value="">Elige…</option> }
            @for (b of branches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Desde</span>
          <input type="date" class="border rounded-lg px-2 h-11" name="startsOn" [(ngModel)]="startsOn"
                 (ngModelChange)="formDirty = true" />
        </label>
        @if (canPickSupplier()) {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Proveedor <span class="text-muted font-normal">(opcional)</span></span>
            <select class="border rounded-lg px-2 h-11" name="supplier" [(ngModel)]="supplierId" (ngModelChange)="formDirty = true">
              <option value="">Ninguno</option>
              @for (s of suppliers(); track s.id) { <option [value]="s.id">{{ s.displayName }}</option> }
            </select>
          </label>
        }
      </div>
      <small class="text-xs text-muted">Desde: la primera fecha que te avisa. Si la pones en el pasado, te muestra lo
        que quedó sin pagar (hasta 3 meses).</small>
    </app-form-dialog>
  `,
})
export class RecurringExpensesDialogComponent {
  private readonly api = inject(RecurringExpensesApi);
  private readonly expenses = inject(ExpensesApi);
  private readonly cash = inject(CashApi);
  private readonly organization = inject(OrganizationApi);
  private readonly parties = inject(PartiesApi);
  protected readonly canManage = permissionFlag('expenses:manage');
  protected readonly canPickSupplier = permissionFlag('parties:read');

  readonly visible = model(false);
  /** Se cerró la lista: quien la abrió vuelve a pedir lo que está por pagar. */
  readonly changed = output<void>();

  protected readonly items = signal<RecurringExpense[]>([]);
  protected readonly loaded = signal(false);
  protected readonly toggling = signal<string | null>(null);
  protected readonly editing = signal<RecurringExpense | null>(null);
  protected readonly categories = signal<ExpenseCategory[]>([]);
  private readonly allMethods = signal<PaymentMethod[]>([]);
  protected readonly methods = computed(() => expenseMethods(this.allMethods(), false));
  protected readonly branches = signal<Branch[]>([]);
  protected readonly suppliers = signal<Party[]>([]);
  protected readonly frequencies: { value: RecurringFrequency; label: string }[] = [
    { value: 'MONTHLY', label: 'Cada mes' },
    { value: 'BIWEEKLY', label: 'Cada quincena' },
  ];

  protected formOpen = false;
  protected formDirty = false;
  protected name = '';
  protected amount: number | null = null;
  protected frequencyValue: RecurringFrequency = 'MONTHLY';
  protected dayOfMonth: number | null = 5;
  protected categoryId = '';
  protected methodId = '';
  protected branchId = '';
  protected supplierId = '';
  protected startsOn = '';
  private optionsLoaded = false;

  protected readonly cop = formatCop;
  protected readonly day = formatDay;
  protected readonly frequency = frequencyLabel;

  open(): void {
    this.loadList();
    this.visible.set(true);
  }

  private loadList(): void {
    this.api.list().subscribe({
      next: (list) => {
        this.items.set(list);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }

  protected openForm(r: RecurringExpense | null): void {
    this.loadOptions();
    this.editing.set(r);
    this.name = r?.name ?? '';
    this.amount = r?.amount ?? null;
    this.frequencyValue = r?.frequency ?? 'MONTHLY';
    this.dayOfMonth = r?.dayOfMonth ?? 5;
    this.categoryId = r?.categoryId ?? '';
    this.methodId = r?.paymentMethodId ?? (this.methods().find((m) => !m.affectsCash)?.id ?? '');
    this.branchId = r?.branchId ?? (this.branches().length === 1 ? this.branches()[0].id : '');
    this.supplierId = r?.supplierId ?? '';
    this.startsOn = r?.startsOn ?? isoDate(businessToday());
    this.formDirty = false;
    this.formOpen = true;
  }

  private loadOptions(): void {
    this.expenses.categories().subscribe((list) => this.categories.set(list));
    if (this.optionsLoaded) {
      return;
    }
    this.optionsLoaded = true;
    this.cash.paymentMethods().subscribe({
      next: (list) => {
        this.allMethods.set(list);
        this.methodId ||= this.methods().find((m) => !m.affectsCash)?.id ?? '';
      },
      error: () => (this.optionsLoaded = false),
    });
    this.organization.branches({ page: 0, size: 100 }).subscribe((page) => {
      const active = page.content.filter((b) => b.active);
      this.branches.set(active);
      if (!this.branchId && active.length === 1) {
        this.branchId = active[0].id;
      }
    });
    if (this.canPickSupplier()) {
      this.parties.search('suppliers', { page: 0, size: 100 }, null, false).subscribe({
        next: (page) => this.suppliers.set(page.content),
        error: () => this.suppliers.set([]),
      });
    }
  }

  protected label(method: PaymentMethod): string {
    return methodLabel(method.code, method.name);
  }

  protected problem(): string | null {
    return recurringProblem({ name: this.name, amount: this.amount, categoryId: this.categoryId,
      branchId: this.branchId, methodId: this.methodId, frequency: this.frequencyValue, dayOfMonth: this.dayOfMonth });
  }

  protected readonly saveRequest = (): Observable<RecurringExpense> => {
    const input = {
      name: this.name.trim(), amount: Number(this.amount), categoryId: this.categoryId, branchId: this.branchId,
      supplierId: this.supplierId || null, paymentMethodId: this.methodId, frequency: this.frequencyValue,
      dayOfMonth: this.frequencyValue === 'MONTHLY' ? Number(this.dayOfMonth) : null,
      startsOn: this.startsOn || null, note: this.editing()?.note ?? null,
    };
    const current = this.editing();
    return current ? this.api.update(current.id, { ...input, active: current.active }) : this.api.create(input);
  };

  protected onSaved(): void {
    this.loadList();
  }

  protected toggle(r: RecurringExpense): void {
    this.toggling.set(r.id);
    this.api.update(r.id, {
      name: r.name, amount: r.amount, categoryId: r.categoryId, branchId: r.branchId, supplierId: r.supplierId,
      paymentMethodId: r.paymentMethodId, frequency: r.frequency, dayOfMonth: r.dayOfMonth, startsOn: r.startsOn,
      note: r.note, active: !r.active,
    }).subscribe({
      next: (updated) => {
        this.toggling.set(null);
        this.items.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      },
      error: () => this.toggling.set(null),
    });
  }
}
