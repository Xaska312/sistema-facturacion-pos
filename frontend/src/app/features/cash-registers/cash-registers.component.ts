import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { Branch, CashRegister, PageResponse } from '../../core/api/api.models';
import { OrganizationApi } from '../../core/api/organization.api';
import { ColumnDef, DataTableComponent } from '../../shared/data-table.component';
import { HasPermissionDirective } from '../../shared/has-permission.directive';

@Component({
  selector: 'app-cash-registers',
  imports: [ReactiveFormsModule, ButtonModule, DialogModule, InputTextModule, TagModule, DataTableComponent,
    HasPermissionDirective],
  template: `
    <div class="flex flex-wrap items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-semibold">Cajas registradoras</h1>
      <div class="flex gap-2 items-center">
        <select class="border rounded px-2 py-2 text-sm" [value]="branchFilter() ?? ''" (change)="filterBy($event)">
          <option value="">Todas las sucursales</option>
          @for (b of branches(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
        <p-button *hasPermission="'cash-registers:manage'" label="Nueva caja" (onClick)="openCreate()" />
      </div>
    </div>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    (pageChange)="load($event)">
      <ng-template #actions let-row>
        <span class="inline-flex gap-2 items-center">
          <p-tag [value]="row.active ? 'Activa' : 'Inactiva'" [severity]="row.active ? 'success' : 'secondary'" />
          <ng-container *hasPermission="'cash-registers:manage'">
            <p-button label="Renombrar" size="small" [text]="true" (onClick)="openEdit(row)" />
            <p-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                      [severity]="row.active ? 'danger' : 'success'" (onClick)="toggle(row)" />
          </ng-container>
        </span>
      </ng-template>
    </app-data-table>

    <p-dialog [(visible)]="dialogOpen" [modal]="true" [header]="editing() ? 'Renombrar caja' : 'Nueva caja'"
              [style]="{ width: '28rem' }">
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-3">
        @if (!editing()) {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Sucursal</span>
            <select formControlName="branchId" class="border rounded px-2 py-2">
              @for (b of activeBranches(); track b.id) {
                <option [value]="b.id">{{ b.name }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Código</span>
            <input pInputText formControlName="code" placeholder="CAJA-2" />
          </label>
        }
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Nombre</span>
          <input pInputText formControlName="name" />
        </label>
        <div class="flex justify-end gap-2 mt-2">
          <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="dialogOpen = false" />
          <p-button type="submit" label="Guardar" [loading]="saving()" [disabled]="form.invalid" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class CashRegistersComponent implements OnInit {
  private readonly api = inject(OrganizationApi);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly page = signal<PageResponse<CashRegister> | null>(null);
  protected readonly branches = signal<Branch[]>([]);
  protected readonly branchFilter = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly editing = signal<CashRegister | null>(null);
  protected dialogOpen = false;
  private currentPage = 0;

  protected readonly trackById = (row: CashRegister): string => row.id;
  protected readonly columns: ColumnDef<CashRegister>[] = [
    { header: 'Código', cell: (r) => r.code, cellClass: 'font-mono' },
    { header: 'Nombre', cell: (r) => r.name },
    { header: 'Sucursal', cell: (r) => this.branches().find((b) => b.id === r.branchId)?.name ?? '—' },
  ];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    branchId: ['', Validators.required],
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_-]{2,20}$/)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });

  protected activeBranches(): Branch[] {
    return this.branches().filter((b) => b.active);
  }

  ngOnInit(): void {
    this.api.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => this.branches.set(p.content));
    this.load(0);
  }

  load(page: number): void {
    this.currentPage = page;
    this.loading.set(true);
    this.api.cashRegisters({ page, size: 20, sort: 'code,asc' }, this.branchFilter()).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  filterBy(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.branchFilter.set(value || null);
    this.load(0);
  }

  openCreate(): void {
    this.editing.set(null);
    const active = this.activeBranches();
    const preferred = active.find((b) => b.id === this.branchFilter()) ?? active[0];
    this.form.reset({ branchId: preferred?.id ?? '', code: '', name: '' });
    this.form.controls.branchId.enable();
    this.form.controls.code.enable();
    this.dialogOpen = true;
  }

  openEdit(register: CashRegister): void {
    this.editing.set(register);
    this.form.reset({ branchId: register.branchId, code: register.code, name: register.name });
    this.form.controls.branchId.disable();
    this.form.controls.code.disable();
    this.dialogOpen = true;
  }

  save(): void {
    const value = this.form.getRawValue();
    const current = this.editing();
    this.saving.set(true);
    const request = current
      ? this.api.renameCashRegister(current.id, value.name.trim())
      : this.api.createCashRegister(value.branchId, value.code, value.name.trim());
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogOpen = false;
        this.messages.add({ severity: 'success', summary: 'Caja guardada' });
        this.load(this.currentPage);
      },
      error: () => this.saving.set(false),
    });
  }

  toggle(register: CashRegister): void {
    const activate = !register.active;
    this.confirm.confirm({
      header: activate ? 'Activar caja' : 'Desactivar caja',
      message: `¿${activate ? 'Activar' : 'Desactivar'} la caja ${register.name}?`,
      acceptLabel: 'Sí',
      rejectLabel: 'No',
      accept: () => this.api.setCashRegisterActive(register.id, activate).subscribe(() => this.load(this.currentPage)),
    });
  }
}
