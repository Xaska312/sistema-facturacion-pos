import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { Observable, catchError, from, of, switchMap, tap } from 'rxjs';
import { AiApi, AskUsage } from '../../core/api/ai.api';
import { Branch, Party, PaymentMethod } from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { Expense, ExpenseCategory, ExpensesApi, RecurringDue, RecurringExpensesApi } from '../../core/api/expenses.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { PartiesApi } from '../../core/api/parties.api';
import { newIdempotencyKey } from '../../core/api/sales.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { problemMessage } from '../../core/errors/problem';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { shrinkPhoto } from '../../shared/image-shrink';
import { formatCop } from '../../shared/money';
import { methodLabel } from '../pos/pos-labels';
import { businessToday, isoDate } from '../reports/periods';
import { documentProblem, expenseMethods, expenseNumber, expenseProblem } from './expense-text';
import { receiptFill, receiptsLeft } from './receipt-read-text';
import { dueLabel } from './recurring-text';

type Mode = 'new' | 'cash' | 'edit' | 'classify' | 'recurring';

/**
 * Registrar, corregir o clasificar un gasto (decisión 320).
 * <ul>
 *   <li>{@code openCash}: desde Mi caja; siempre en efectivo, sale de la caja abierta.</li>
 *   <li>{@code openNew}: desde Gastos; se elige con qué se pagó. Con otro medio no toca la caja y lleva sede y fecha.</li>
 *   <li>{@code openEdit}: corrige categoría, proveedor, nota y, si no salió de una caja, la fecha.</li>
 *   <li>{@code openClassify}: le pone categoría a un egreso de caja de antes.</li>
 *   <li>{@code openRecurring}: paga una fecha de un gasto fijo (decisión 321) con lo sugerido, que se puede cambiar.</li>
 * </ul>
 * La clave de idempotencia se crea al abrir: reintentar no registra dos gastos.
 * Con XASKA IA, "Leer con Aska" (decisión 325) llena el formulario con la foto o el PDF del recibo, que queda como
 * soporte; la persona revisa y guarda.
 */
@Component({
  selector: 'app-expense-dialog',
  imports: [FormsModule, AppInputDirective, PesosInputDirective, FormDialogComponent],
  template: `
    <app-form-dialog [(visible)]="visible" [header]="title()" width="30rem" [submitLabel]="submitLabel()"
                     [dirty]="dirty()" [invalidMessage]="problem()" [save]="saveRequest" [successMessage]="null"
                     (saved)="onSaved($any($event))">
      @if (due(); as d) {
        <p class="text-sm"><strong>{{ d.name }}</strong> · {{ d.categoryName }}
          <span class="block text-xs" [class.text-danger]="d.overdue" [class.text-muted]="!d.overdue">{{ dueText(d) }}</span></p>
      }
      @if (canRead()) {
        <div class="flex flex-col gap-2 rounded-xl border border-brand bg-brand-soft text-brand-soft-fg p-3">
          <div class="flex flex-wrap items-center gap-2">
            <label class="inline-flex items-center gap-2 min-h-11 px-3 rounded-lg bg-brand text-brand-contrast hover:bg-brand-hover font-semibold text-sm"
                   [class.cursor-pointer]="!reading()" [class.opacity-60]="reading()">
              <i class="pi" [class.pi-sparkles]="!reading()" [class.pi-spin]="reading()" [class.pi-spinner]="reading()"
                 aria-hidden="true"></i>
              {{ reading() ? 'Aska está leyendo el recibo…' : 'Leer con Aska' }}
              <input type="file" class="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf"
                     [disabled]="reading()" (change)="readReceipt($event)" />
            </label>
            <span class="text-xs">Tómale foto al recibo y Aska llena el gasto.
              @if (readUsage(); as u) { {{ left(u) }} }</span>
          </div>
          @if (readError()) {
            <small class="text-xs text-danger" role="alert">{{ readError() }}</small>
          }
          @if (readNotices().length) {
            <ul class="text-xs list-disc pl-4" role="status">
              @for (n of readNotices(); track n) { <li>{{ n }}</li> }
            </ul>
          }
        </div>
      }
      @if (takesAmount()) {
        <div class="flex flex-col gap-1">
          <label for="expense-amount" class="text-sm font-medium">¿Cuánto fue?</label>
          <input id="expense-amount" appPesos class="h-12 border rounded-lg px-3 text-xl text-right tabular-nums"
                 [(ngModel)]="amount" name="amount" />
        </div>
      }
      @if (expense(); as e) {
        <p class="text-sm">{{ number(e) }} · <strong class="tabular-nums">{{ cop(e.amount) }}</strong>
          <span class="text-muted"> · {{ e.paymentMethodName ?? 'Efectivo' }}{{ e.fromCash ? ' de la caja' : '' }}</span></p>
      }

      @if (mode() !== 'recurring') {
      <fieldset class="flex flex-col gap-1">
        <legend class="text-sm font-medium mb-1">¿En qué se gastó?</legend>
        <div class="flex flex-wrap gap-2">
          @for (c of categories(); track c.id) {
            <button type="button" class="min-h-11 px-3 border rounded-lg text-sm"
                    [class.border-brand]="categoryId === c.id" [class.bg-brand-soft]="categoryId === c.id"
                    [class.font-semibold]="categoryId === c.id" [attr.aria-pressed]="categoryId === c.id"
                    (click)="categoryId = c.id">{{ c.name }}</button>
          } @empty {
            <span class="text-sm text-muted">Cargando categorías…</span>
          }
        </div>
      </fieldset>
      }

      @if (picksMethod()) {
        <fieldset class="flex flex-col gap-1">
          <legend class="text-sm font-medium mb-1">¿Con qué se pagó?</legend>
          <div class="flex flex-wrap gap-2">
            @for (m of methods(); track m.id) {
              <label class="flex items-center gap-2 min-h-11 px-3 border rounded-lg cursor-pointer"
                     [class.border-brand]="methodId === m.id">
                <input type="radio" name="expense-method" [value]="m.id" [(ngModel)]="methodId" />
                {{ label(m) }}
              </label>
            }
          </div>
        </fieldset>
      }
      @if (takesAmount() && selected()?.affectsCash) {
        <p class="text-xs text-muted">Sale del efectivo de tu caja abierta (no puede pasar de lo que hay en ella) y
          queda con la fecha de hoy.</p>
      }

      @if (outsideCash()) {
        <div class="grid gap-3 sm:grid-cols-2">
          @if (picksMethod()) {
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">Sede</span>
              <select class="border rounded-lg px-2 h-11" name="branch" [(ngModel)]="branchId">
                @if (branches().length !== 1) { <option value="">Elige…</option> }
                @for (b of branches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }
              </select>
            </label>
          }
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Fecha del gasto</span>
            <input type="date" class="border rounded-lg px-2 h-11" name="date" [max]="today" [(ngModel)]="date" />
          </label>
          <label class="flex flex-col gap-1 sm:col-span-2">
            <span class="text-sm font-medium">Referencia
              @if (!selected()?.requiresReference) { <span class="text-muted font-normal">(opcional)</span> }</span>
            <input appInput name="reference" maxlength="100" [(ngModel)]="reference"
                   placeholder="Ej.: número de la transferencia" />
          </label>
        </div>
      }

      @if (canPickSupplier() && mode() !== 'cash') {
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Proveedor <span class="text-muted font-normal">(opcional)</span></span>
          <select class="border rounded-lg px-2 h-11" name="supplier" [(ngModel)]="supplierId">
            <option value="">Ninguno</option>
            @for (s of suppliers(); track s.id) { <option [value]="s.id">{{ s.displayName }}</option> }
          </select>
        </label>
      }

      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Nota <span class="text-muted font-normal">(opcional)</span></span>
        <input appInput name="note" maxlength="255" [(ngModel)]="note" placeholder="Ej.: recibo de la luz de marzo" />
      </label>

      @if (mode() !== 'classify') {
        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium">Soporte <span class="text-muted font-normal">(opcional)</span></span>
          <div class="flex flex-wrap items-center gap-2">
            <label class="inline-flex items-center gap-2 min-h-11 px-3 border rounded-lg cursor-pointer text-sm">
              <i class="pi pi-camera" aria-hidden="true"></i>
              {{ file() ? 'Cambiar' : expense()?.hasDocument ? 'Reemplazar soporte' : 'Foto o PDF del recibo' }}
              <input type="file" class="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf"
                     (change)="pickFile($event)" />
            </label>
            @if (file(); as f) {
              <span class="text-sm text-muted truncate max-w-48">{{ f.name }}</span>
              <button type="button" class="text-sm text-brand hover:underline" (click)="file.set(null)">Quitar</button>
            }
          </div>
          @if (fileError()) {
            <small class="text-xs text-danger" role="alert">{{ fileError() }}</small>
          }
        </div>
      }
    </app-form-dialog>
  `,
})
export class ExpenseDialogComponent {
  private readonly api = inject(ExpensesApi);
  private readonly recurring = inject(RecurringExpensesApi);
  private readonly cash = inject(CashApi);
  private readonly organization = inject(OrganizationApi);
  private readonly parties = inject(PartiesApi);
  private readonly messages = inject(MessageService);
  private readonly ai = inject(AiApi);
  private readonly canManage = permissionFlag('expenses:manage');
  private readonly canAsk = permissionFlag('ai:ask');
  protected readonly canPickSupplier = permissionFlag('parties:read');

  readonly visible = model(false);
  readonly saved = output<Expense>();

  protected readonly mode = signal<Mode>('new');
  protected readonly expense = signal<Expense | null>(null);
  protected readonly due = signal<RecurringDue | null>(null);
  protected readonly categories = signal<ExpenseCategory[]>([]);
  protected readonly allMethods = signal<PaymentMethod[]>([]);
  protected readonly branches = signal<Branch[]>([]);
  protected readonly suppliers = signal<Party[]>([]);
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  /** Leer con Aska (decisión 325): tope del mes (null mientras no se sabe o sin XASKA IA), estado y avisos. */
  protected readonly readUsage = signal<AskUsage | null>(null);
  protected readonly reading = signal(false);
  protected readonly readError = signal<string | null>(null);
  protected readonly readNotices = signal<string[]>([]);
  /** Sin expenses:manage solo se registra en efectivo desde la caja. */
  protected readonly methods = computed(() => expenseMethods(this.allMethods(), !this.canManage()));

  protected amount: number | null = null;
  protected categoryId = '';
  protected methodId = '';
  protected branchId = '';
  protected date = '';
  protected supplierId = '';
  protected reference = '';
  protected note = '';
  protected today = isoDate(businessToday());
  private idempotencyKey = '';
  private loaded = false;

  protected readonly cop = formatCop;
  protected readonly number = expenseNumber;
  protected readonly dueText = dueLabel;

  /** Gasto en efectivo desde Mi caja. */
  openCash(): void {
    this.start('cash', null);
  }

  /** Gasto nuevo desde la pantalla de Gastos: por defecto fuera de la caja (lo de caja se registra en Mi caja). */
  openNew(): void {
    this.start('new', null);
  }

  openEdit(expense: Expense): void {
    this.start('edit', expense);
  }

  openClassify(expense: Expense): void {
    this.start('classify', expense);
  }

  /** Pagar una fecha de un gasto fijo: todo viene sugerido y se puede cambiar antes de guardar. */
  openRecurring(due: RecurringDue): void {
    this.start('recurring', null);
    this.due.set(due);
    this.amount = due.amount;
    this.categoryId = due.categoryId;
    this.methodId = due.paymentMethodId;
    this.branchId = due.branchId;
    this.date = due.dueDate > this.today ? this.today : due.dueDate;
    this.supplierId = due.supplierId ?? '';
    this.note = due.name;
  }

  private start(mode: Mode, expense: Expense | null): void {
    this.mode.set(mode);
    this.expense.set(expense);
    this.due.set(null);
    this.today = isoDate(businessToday());
    this.amount = null;
    this.categoryId = expense?.categoryId ?? '';
    this.methodId = expense?.paymentMethodId ?? this.defaultMethod();
    this.branchId = expense?.branchId ?? (this.branches().length === 1 ? this.branches()[0].id : '');
    this.date = expense?.date ?? this.today;
    this.supplierId = expense?.supplierId ?? '';
    this.reference = expense?.reference ?? '';
    this.note = expense?.note ?? '';
    this.file.set(null);
    this.fileError.set(null);
    this.reading.set(false);
    this.readError.set(null);
    this.readNotices.set([]);
    this.idempotencyKey = newIdempotencyKey('gasto');
    this.load();
    this.visible.set(true);
  }

  /** Categorías cada vez (pueden haber cambiado); medios, sedes y proveedores una sola vez. */
  private load(): void {
    if (this.canAsk() && (this.mode() === 'new' || this.mode() === 'cash')) {
      this.ai.expenseReceiptUsage().subscribe({ next: (u) => this.readUsage.set(u), error: () => this.readUsage.set(null) });
    }
    this.api.categories().subscribe((list) => {
      // Un gasto con una categoría apagada la conserva al corregirlo.
      const current = this.expense();
      const missing = current?.categoryId && !list.some((c) => c.id === current.categoryId)
        ? [{ id: current.categoryId, name: current.categoryName, active: false, sortOrder: 0 }] : [];
      this.categories.set([...list, ...missing]);
    });
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    this.cash.paymentMethods().subscribe({
      next: (list) => {
        this.allMethods.set(list);
        this.methodId ||= this.defaultMethod();
      },
      error: () => (this.loaded = false),
    });
    if (this.canManage()) {
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
  }

  private defaultMethod(): string {
    const list = this.methods();
    const wanted = this.mode() === 'cash' ? list.find((m) => m.affectsCash) : list.find((m) => !m.affectsCash);
    return (wanted ?? list[0])?.id ?? '';
  }

  /** El botón sale en un gasto nuevo (o de la caja) si el negocio tiene XASKA IA con recibos en su plan. */
  protected canRead(): boolean {
    const u = this.readUsage();
    return (this.mode() === 'new' || this.mode() === 'cash') && !!u && u.available && u.limit > 0;
  }

  protected left(u: AskUsage): string {
    return receiptsLeft(u.limit, u.used);
  }

  /** Aska lee el recibo, llena lo que vio y el archivo queda como soporte del gasto. */
  protected readReceipt(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    input.value = '';
    if (!picked || this.reading()) {
      return;
    }
    const problem = documentProblem(picked);
    if (problem) {
      this.readError.set(problem);
      return;
    }
    this.reading.set(true);
    this.readError.set(null);
    this.readNotices.set([]);
    from(shrinkPhoto(picked)).pipe(switchMap((small) => this.ai.readExpenseReceipt(small))).subscribe({
      next: (read) => {
        this.reading.set(false);
        this.readUsage.set(read.usage);
        const fill = receiptFill(read, { fromCash: this.mode() === 'cash', outside: this.outsideCash(),
          supplierIds: this.suppliers().map((s) => s.id), note: this.note, today: this.today });
        if (fill.amount !== undefined) { this.amount = fill.amount; }
        if (fill.categoryId !== undefined) { this.categoryId = fill.categoryId; }
        if (fill.date !== undefined) { this.date = fill.date; }
        if (fill.supplierId !== undefined) { this.supplierId = fill.supplierId; }
        if (fill.reference !== undefined) { this.reference = fill.reference; }
        if (fill.note !== undefined) { this.note = fill.note; }
        this.readNotices.set(fill.notices);
        this.file.set(picked);
        this.fileError.set(null);
      },
      error: (error: unknown) => {
        this.reading.set(false);
        this.readError.set(error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500
          ? problemMessage(error) : 'No me pude conectar. Revisa el internet e intenta de nuevo.');
      },
    });
  }

  protected selected(): PaymentMethod | undefined {
    return this.allMethods().find((m) => m.id === this.methodId);
  }

  /** Se escribe el valor: gasto nuevo, desde la caja o de un gasto fijo. */
  protected takesAmount(): boolean {
    return this.mode() === 'new' || this.mode() === 'cash' || this.mode() === 'recurring';
  }

  /** Se elige con qué se pagó (en la caja siempre es efectivo). */
  protected picksMethod(): boolean {
    return this.mode() === 'new' || this.mode() === 'recurring';
  }

  /** Lleva sede, fecha y referencia: un gasto nuevo con otro medio, o uno que no salió de una caja al corregirlo. */
  protected outsideCash(): boolean {
    if (this.picksMethod()) {
      const method = this.selected();
      return !!method && !method.affectsCash;
    }
    return this.mode() === 'edit' && !this.expense()?.fromCash;
  }

  protected label(method: PaymentMethod): string {
    return methodLabel(method.code, method.name);
  }

  protected title(): string {
    switch (this.mode()) {
      case 'cash': return 'Gasto en efectivo';
      case 'edit': return 'Corregir gasto';
      case 'classify': return 'Clasificar egreso de caja';
      case 'recurring': return 'Pagar gasto fijo';
      default: return 'Registrar gasto';
    }
  }

  protected submitLabel(): string {
    return this.mode() === 'edit' ? 'Guardar' : this.mode() === 'classify' ? 'Clasificar'
      : this.mode() === 'recurring' ? 'Registrar pago' : 'Registrar gasto';
  }

  protected dirty(): boolean {
    if (this.mode() === 'recurring') {
      return this.file() !== null || Number(this.amount ?? 0) !== this.due()?.amount;
    }
    return Number(this.amount ?? 0) > 0 || this.note.trim() !== (this.expense()?.note ?? '') || this.file() !== null;
  }

  protected problem(): string | null {
    if (this.takesAmount()) {
      return expenseProblem({ amount: this.amount, categoryId: this.categoryId, method: this.selected(),
        branchId: this.branchId, date: this.date, reference: this.reference }, this.today);
    }
    if (!this.categoryId) {
      return 'Elige la categoría.';
    }
    return this.mode() === 'edit' && this.outsideCash() && this.date > this.today
      ? 'La fecha del gasto no puede ser futura.' : null;
  }

  protected pickFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    input.value = '';
    if (!picked) {
      return;
    }
    const problem = documentProblem(picked);
    this.fileError.set(problem);
    this.file.set(problem ? null : picked);
  }

  protected readonly saveRequest = (): Observable<Expense> => {
    const supplierId = this.supplierId || null;
    const note = this.note.trim() || null;
    let request: Observable<Expense>;
    const current = this.expense();
    const due = this.due();
    if (this.mode() === 'recurring' && due) {
      const outside = this.outsideCash();
      request = this.recurring.pay(due.recurringId, {
        dueDate: due.dueDate, amount: Number(this.amount), paymentMethodId: this.methodId,
        branchId: outside ? this.branchId : null, date: outside ? this.date : null, supplierId,
        reference: outside ? this.reference.trim() || null : null, note,
      }, this.idempotencyKey);
    } else if (this.mode() === 'classify' && current) {
      request = this.api.classify(current.id, { categoryId: this.categoryId, supplierId, note });
    } else if (this.mode() === 'edit' && current) {
      request = this.api.update(current.id, {
        categoryId: this.categoryId, date: current.fromCash ? null : this.date, supplierId,
        reference: this.reference.trim() || null, note,
      });
    } else {
      const outside = this.outsideCash();
      request = this.api.create({
        amount: Number(this.amount), categoryId: this.categoryId, paymentMethodId: this.methodId,
        branchId: outside ? this.branchId : null, date: outside ? this.date : null,
        supplierId: this.mode() === 'cash' ? null : supplierId,
        reference: outside ? this.reference.trim() || null : null, note,
      }, this.idempotencyKey);
    }
    return request.pipe(
      tap(() => (this.idempotencyKey = newIdempotencyKey('gasto'))),
      switchMap((expense) => this.upload(expense)),
    );
  };

  /** Sube el soporte después de guardar. Si falla, el gasto ya quedó: se avisa y se puede subir al corregirlo. */
  private upload(expense: Expense): Observable<Expense> {
    const file = this.file();
    if (!file) {
      return of(expense);
    }
    return from(shrinkPhoto(file)).pipe(
      switchMap((small) => this.api.attach(expense.id, small)),
      catchError(() => {
        this.messages.add({ severity: 'warn', summary: 'El gasto quedó registrado, pero el soporte no subió',
          detail: 'Ábrelo en Gastos y súbelo de nuevo.', life: 7000 });
        return of(expense);
      }),
    );
  }

  protected onSaved(expense: Expense): void {
    this.saved.emit(expense);
  }
}
