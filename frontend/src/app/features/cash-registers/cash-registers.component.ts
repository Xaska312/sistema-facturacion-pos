import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';
import { Branch, CashRegister, PageResponse } from '../../core/api/api.models';
import { OrganizationApi } from '../../core/api/organization.api';
import { AuthService } from '../../core/auth/auth.service';
import { ConfirmService } from '../../shared/confirm';
import { FieldErrorComponent } from '../../shared/forms/field-error.component';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { activeStatus } from '../../shared/status';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';

@Component({
  selector: 'app-cash-registers',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, DataTableComponent, PageHeaderComponent,
    FormDialogComponent, FieldErrorComponent],
  template: `
    <app-page-header title="Cajas registradoras"
                     description="Cada caja se abre con una base de efectivo y se cierra con su arqueo.">
      @if (canManage) {
        <p-button label="Nueva caja" icon="pi pi-plus" (onClick)="openCreate()" />
      }
    </app-page-header>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    initialSort="code,asc" caption="Cajas registradoras" emptyIcon="pi pi-calculator"
                    emptyTitle="Aún no hay cajas" emptyMessage="Crea al menos una caja para poder vender."
                    [emptyActionLabel]="canManage ? 'Crear caja' : null" (emptyAction)="openCreate()"
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span class="sr-only">Sucursal</span>
        <select class="border rounded-md px-2 py-2" [value]="branchFilter() ?? ''" (change)="filterBy($event)">
          <option value="">Todas las sucursales</option>
          @for (b of branches(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      </label>
      <ng-template #actions let-row>
        @if (canManage) {
          <p-button label="Renombrar" icon="pi pi-pencil" size="small" [text]="true" (onClick)="openEdit(row)" />
          <p-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                    [icon]="row.active ? 'pi pi-ban' : 'pi pi-check-circle'"
                    [severity]="row.active ? 'danger' : 'success'" (onClick)="toggle(row)" />
        }
      </ng-template>
    </app-data-table>

    <app-form-dialog [(visible)]="dialogOpen" [header]="editing() ? 'Renombrar caja' : 'Nueva caja'" [form]="form"
                     width="28rem" [save]="saveRequest" successMessage="Caja guardada" (saved)="load(query)">
      <div [formGroup]="form" class="flex flex-col gap-3">
        @if (!editing()) {
          <div class="flex flex-col gap-1">
            <label for="register-branch" class="text-sm font-medium">Sucursal</label>
            <select id="register-branch" formControlName="branchId" class="border rounded-md px-2 py-2">
              @for (b of activeBranches(); track b.id) {
                <option [value]="b.id">{{ b.name }}</option>
              }
            </select>
            <app-field-error [control]="form.controls.branchId" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="register-code" class="text-sm font-medium">Código</label>
            <input pInputText id="register-code" formControlName="code" placeholder="CAJA-2" autocomplete="off" />
            <app-field-error [control]="form.controls.code"
                             patternMessage="Usa de 2 a 20 letras, números, guiones o guiones bajos (sin espacios)." />
          </div>
        }
        <div class="flex flex-col gap-1">
          <label for="register-name" class="text-sm font-medium">Nombre</label>
          <input pInputText id="register-name" formControlName="name" placeholder="Caja de la entrada" />
          <app-field-error [control]="form.controls.name" />
        </div>
      </div>
    </app-form-dialog>
  `,
})
export class CashRegistersComponent implements OnInit {
  private readonly api = inject(OrganizationApi);
  private readonly confirm = inject(ConfirmService);
  protected readonly canManage = inject(AuthService).hasPermission('cash-registers:manage');

  protected readonly page = signal<PageResponse<CashRegister> | null>(null);
  protected readonly branches = signal<Branch[]>([]);
  protected readonly activeBranches = computed(() => this.branches().filter((b) => b.active));
  protected readonly branchFilter = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly editing = signal<CashRegister | null>(null);
  protected dialogOpen = false;
  protected query: TableQuery = initialQuery(20, 'code,asc');

  protected readonly trackById = (row: CashRegister): string => row.id;
  protected readonly columns: ColumnDef<CashRegister>[] = [
    { header: 'Código', cell: (r) => r.code, kind: 'mono', sortField: 'code' },
    { header: 'Nombre', cell: (r) => r.name, sortField: 'name' },
    { header: 'Sucursal', cell: (r) => this.branches().find((b) => b.id === r.branchId)?.name },
    { header: 'Estado', cell: (r) => activeStatus(r.active, true), kind: 'status' },
  ];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    branchId: ['', Validators.required],
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_-]{2,20}$/)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });

  ngOnInit(): void {
    this.api.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => this.branches.set(p.content));
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api.cashRegisters(toPageQuery(query), this.branchFilter()).subscribe({
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
    this.load({ ...this.query, page: 0 });
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

  protected readonly saveRequest = (): Observable<unknown> => {
    const value = this.form.getRawValue();
    const current = this.editing();
    return current
      ? this.api.renameCashRegister(current.id, value.name.trim())
      : this.api.createCashRegister(value.branchId, value.code.trim(), value.name.trim());
  };

  toggle(register: CashRegister): void {
    this.confirm.toggleActive({
      active: register.active,
      noun: 'caja',
      name: register.name,
      consequence: 'No se podrá abrir para vender hasta que la actives de nuevo.',
      accept: () =>
        this.api.setCashRegisterActive(register.id, !register.active).subscribe(() => this.load(this.query)),
    });
  }
}
