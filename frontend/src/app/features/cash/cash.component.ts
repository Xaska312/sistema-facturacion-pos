import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import {
  CashMovement,
  CashReport,
  CashSession,
  ManualCashMovementType,
  RegisterOption,
} from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { newIdempotencyKey } from '../../core/api/sales.api';
import { formatTime } from '../../shared/format';
import { HasPermissionDirective } from '../../shared/has-permission.directive';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef } from '../../shared/table/table';
import { CashReportComponent } from './cash-report.component';
import { CASH_MOVEMENT_LABEL } from './labels';
import { TermComponent } from '../../shared/help/term.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';

/** Mi caja: abrir con base, registrar ingresos/egresos/retiros y cerrar con arqueo ciego. */
@Component({
  selector: 'app-cash',
  imports: [TermComponent, SkeletonModule, FormsModule, PesosInputDirective, RouterLink, DatePipe, ButtonModule, DialogModule, InputTextModule, HasPermissionDirective,
    CashReportComponent, PageHeaderComponent, DataTableComponent, CellTemplateDirective],
  template: `
    <app-page-header title="Mi caja" description="Abre tu caja con la base de efectivo, registra ingresos o retiros y ciérrala al final del turno.">
      <a *hasPermission="'cash:read'" pButton routerLink="/app/caja/historial" label="Historial de caja" icon="pi pi-history"
         severity="secondary" [outlined]="true"></a>
    </app-page-header>

    @if (loading()) {
      <div class="card p-4" aria-busy="true" aria-label="Cargando tu caja"><p-skeleton height="5rem" /></div>
    } @else {
    @if (session(); as s) {
      <section class="card p-4 mb-4">
        <div class="flex flex-wrap justify-between gap-3">
          <div>
            <p class="text-lg font-medium">{{ s.registerCode }} · {{ s.registerName }}</p>
            <p class="text-sm text-muted">{{ s.branchName }} · abierta el {{ s.openedAt | date: 'short' }}</p>
            <p class="text-sm text-muted">Base de apertura: {{ cop(s.openingAmount) }}</p>
          </div>
          <div class="flex flex-wrap gap-2 items-start">
            <a *hasPermission="'sales:create'" routerLink="/pos"><p-button label="Ir a vender" /></a>
            <p-button label="Ingreso" severity="secondary" [outlined]="true" (onClick)="openMovement('INCOME')" />
            <p-button label="Egreso" severity="secondary" [outlined]="true" (onClick)="openMovement('EXPENSE')" />
            <p-button label="Retiro" severity="secondary" [outlined]="true" (onClick)="openMovement('WITHDRAWAL')" />
            <p-button label="Informe parcial" severity="secondary" [text]="true" (onClick)="showPartial()" />
            <p-button label="Cerrar caja" severity="danger" (onClick)="openClose()" />
          </div>
        </div>
      </section>

      <app-data-table [columns]="movementColumns" [items]="movements()" [trackBy]="movementId" [pageSizeOptions]="[]"
                      caption="Movimientos de efectivo de esta caja" emptyIcon="pi pi-money-bill"
                      emptyTitle="Sin movimientos de efectivo todavía"
                      emptyMessage="Las ventas en efectivo, los ingresos, egresos y retiros aparecen aquí.">
        <ng-template appCell="amount" let-row>
          <span [class.text-danger]="row.amount < 0">{{ cop(row.amount) }}</span>
        </ng-template>
      </app-data-table>
    } @else {
      <section class="card p-4">
        <p class="mb-3">No tienes una caja abierta. Elige la caja y cuenta la
          <app-term term="base-efectivo">base de efectivo</app-term>.</p>
        @if (registers().length === 0) {
          <p class="text-sm text-muted">No hay cajas disponibles en tus sucursales.</p>
        }
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-4">
          @for (r of registers(); track r.id) {
            <button type="button" class="text-left border rounded-xl p-3 disabled:opacity-50"
                    [class.border-brand]="registerId === r.id" [class.bg-brand-soft]="registerId === r.id"
                    [disabled]="r.busy" (click)="registerId = r.id">
              <p class="font-medium">{{ r.code }} · {{ r.name }}</p>
              <p class="text-sm text-muted">{{ r.branchName }}</p>
              @if (r.busy) {
                <p class="text-xs text-warning">Abierta por {{ r.busyBy ?? 'otro usuario' }}</p>
              }
            </button>
          }
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Base de efectivo</span>
            <input pInputText appPesos class="w-48" [(ngModel)]="openingAmount" />
          </label>
          <label class="flex flex-col gap-1 flex-1 min-w-48">
            <span class="text-sm font-medium">Notas (opcional)</span>
            <input pInputText maxlength="255" [(ngModel)]="openingNotes" />
          </label>
          <p-button label="Abrir caja" [disabled]="!registerId || openingAmount === null || openingAmount < 0"
                    [loading]="saving()" (onClick)="open()" />
        </div>
      </section>
    }
    }

    <p-dialog [header]="movementTitle()" [(visible)]="movementOpen" [modal]="true" [style]="{ width: '26rem' }">
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Valor</span>
          <input pInputText appPesos [(ngModel)]="movementAmount" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Motivo</span>
          <input pInputText maxlength="255" [(ngModel)]="movementReason" placeholder="Ej.: pago de domicilio" />
        </label>
      </div>
      <ng-template #footer>
        <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="movementOpen = false" />
        <p-button label="Registrar" [loading]="saving()"
                  [disabled]="!movementAmount || movementAmount <= 0 || !movementReason.trim()"
                  (onClick)="saveMovement()" />
      </ng-template>
    </p-dialog>

    <p-dialog header="Cerrar caja" [(visible)]="closeOpen" [modal]="true" [style]="{ width: '28rem' }">
      <p class="text-sm text-muted mb-3">
        Cuenta el efectivo que hay en la caja (billetes y monedas) y escribe el total. Es un
        <app-term term="cierre-ciego">cierre ciego</app-term>: no ves cuánto debería haber. Con lo que cuentes se
        hace el <app-term term="arqueo">arqueo</app-term> y verás si cuadra, falta o sobra.
      </p>
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Efectivo contado</span>
          <input pInputText appPesos [(ngModel)]="countedAmount" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Notas (opcional)</span>
          <input pInputText maxlength="500" [(ngModel)]="closingNotes" />
        </label>
      </div>
      <ng-template #footer>
        <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="closeOpen = false" />
        <p-button label="Cerrar caja" severity="danger" [loading]="saving()"
                  [disabled]="countedAmount === null || countedAmount < 0" (onClick)="close()" />
      </ng-template>
    </p-dialog>

    <p-dialog header="Informe de caja" [(visible)]="reportOpen" [modal]="true" [style]="{ width: '32rem' }">
      @if (report(); as r) {
        <app-cash-report [report]="r" />
      }
    </p-dialog>
  `,
})
export class CashComponent implements OnInit {
  private readonly cash = inject(CashApi);
  private readonly messages = inject(MessageService);

  protected readonly cop = formatCop;
  protected readonly movementId = (row: CashMovement): string => row.id;
  protected readonly movementColumns: ColumnDef<CashMovement>[] = [
    { header: 'Hora', cell: (m) => formatTime(m.createdAt), cellClass: 'whitespace-nowrap' },
    { header: 'Tipo', cell: (m) => CASH_MOVEMENT_LABEL[m.type] },
    { header: 'Detalle', cell: (m) => m.reason },
    { header: 'Valor', cell: (m) => m.amount, kind: 'money', template: 'amount' },
  ];
  protected readonly loading = signal(true);
  protected readonly session = signal<CashSession | null>(null);
  protected readonly registers = signal<RegisterOption[]>([]);
  protected readonly movements = signal<CashMovement[]>([]);
  protected readonly report = signal<CashReport | null>(null);
  protected readonly saving = signal(false);
  protected movementType: ManualCashMovementType = 'INCOME';

  protected registerId: string | null = null;
  protected openingAmount: number | null = 0;
  protected openingNotes = '';
  protected movementOpen = false;
  protected movementAmount: number | null = null;
  protected movementReason = '';
  private movementKey = '';
  protected closeOpen = false;
  protected countedAmount: number | null = null;
  protected closingNotes = '';
  protected reportOpen = false;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.cash.current().subscribe({
      next: (session) => {
        this.session.set(session);
        this.loading.set(false);
        if (session) {
          this.cash.movements(session.id).subscribe((list) => this.movements.set([...list].reverse()));
        } else {
          this.cash.registers().subscribe((list) => {
            this.registers.set(list);
            const free = list.filter((r) => !r.busy);
            this.registerId = free.length === 1 ? free[0].id : null;
          });
        }
      },
      error: () => this.loading.set(false),
    });
  }

  open(): void {
    if (!this.registerId || this.openingAmount === null) {
      return;
    }
    this.saving.set(true);
    this.cash.open(this.registerId, Number(this.openingAmount), this.openingNotes.trim() || null).subscribe({
      next: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: 'Caja abierta' });
        this.load();
      },
      error: () => {
        this.saving.set(false);
        this.load();
      },
    });
  }

  openMovement(type: ManualCashMovementType): void {
    this.movementType = type;
    this.movementAmount = null;
    this.movementReason = '';
    this.movementKey = newIdempotencyKey('cash');
    this.movementOpen = true;
  }

  movementTitle(): string {
    return CASH_MOVEMENT_LABEL[this.movementType] + ' de efectivo';
  }

  saveMovement(): void {
    const s = this.session();
    if (!s || !this.movementAmount) {
      return;
    }
    this.saving.set(true);
    this.cash.addMovement(s.id, this.movementType, Number(this.movementAmount), this.movementReason.trim(),
      this.movementKey).subscribe({
      next: (movement) => {
        this.saving.set(false);
        this.movementOpen = false;
        this.movements.update((list) => [movement, ...list]);
      },
      error: () => this.saving.set(false),
    });
  }

  showPartial(): void {
    const s = this.session();
    if (!s) {
      return;
    }
    this.cash.report(s.id).subscribe((report) => {
      this.report.set(report);
      this.reportOpen = true;
    });
  }

  openClose(): void {
    this.countedAmount = null;
    this.closingNotes = '';
    this.closeOpen = true;
  }

  close(): void {
    const s = this.session();
    if (!s || this.countedAmount === null) {
      return;
    }
    this.saving.set(true);
    this.cash.close(s.id, Number(this.countedAmount), this.closingNotes.trim() || null).subscribe({
      next: (report) => {
        this.saving.set(false);
        this.closeOpen = false;
        this.messages.add({ severity: 'success', summary: 'Caja cerrada' });
        this.report.set(report);
        this.reportOpen = true;
        this.movements.set([]);
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }
}
