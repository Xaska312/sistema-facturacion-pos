import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';
import { Branch, City, Department, PageResponse } from '../../core/api/api.models';
import { OrganizationApi } from '../../core/api/organization.api';
import { AuthService } from '../../core/auth/auth.service';
import { ConfirmService } from '../../shared/confirm';
import { FieldErrorComponent } from '../../shared/forms/field-error.component';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { activeStatus } from '../../shared/status';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';

const CODE_PATTERN = /^[A-Za-z0-9_-]{2,20}$/;

@Component({
  selector: 'app-branches',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, DataTableComponent, PageHeaderComponent,
    FormDialogComponent, FieldErrorComponent],
  template: `
    <app-page-header title="Sucursales"
                     description="Los puntos de venta de tu negocio. Cada caja y cada existencia pertenecen a una sucursal.">
      @if (canManage) {
        <p-button label="Nueva sucursal" icon="pi pi-plus" (onClick)="openCreate()" />
      }
    </app-page-header>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    initialSort="code,asc" caption="Sucursales del negocio" emptyIcon="pi pi-building"
                    emptyTitle="Aún no hay sucursales" emptyMessage="Crea una sucursal por cada local donde vendes."
                    [emptyActionLabel]="canManage ? 'Crear sucursal' : null" (emptyAction)="openCreate()"
                    (queryChange)="load($event)">
      <ng-template #actions let-row>
        @if (canManage) {
          <p-button label="Editar" icon="pi pi-pencil" size="small" [text]="true" (onClick)="openEdit(row)" />
          <p-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                    [icon]="row.active ? 'pi pi-ban' : 'pi pi-check-circle'"
                    [severity]="row.active ? 'danger' : 'success'" (onClick)="toggle(row)" />
        }
      </ng-template>
    </app-data-table>

    <app-form-dialog [(visible)]="dialogOpen" [header]="editing() ? 'Editar sucursal' : 'Nueva sucursal'" [form]="form"
                     [save]="saveRequest" successMessage="Sucursal guardada" (saved)="load(query)">
      <div [formGroup]="form" class="flex flex-col gap-3">
        @if (!editing()) {
          <div class="flex flex-col gap-1">
            <label for="branch-code" class="text-sm font-medium">Código</label>
            <input pInputText id="branch-code" formControlName="code" placeholder="NORTE" autocomplete="off"
                   aria-describedby="branch-code-help" />
            <small id="branch-code-help" class="text-xs text-muted">Corto y sin espacios. No se puede cambiar después.</small>
            <app-field-error [control]="form.controls.code"
                             patternMessage="Usa de 2 a 20 letras, números, guiones o guiones bajos (sin espacios)." />
          </div>
        }
        <div class="flex flex-col gap-1">
          <label for="branch-name" class="text-sm font-medium">Nombre</label>
          <input pInputText id="branch-name" formControlName="name" placeholder="Sede norte" />
          <app-field-error [control]="form.controls.name" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="branch-address" class="text-sm font-medium">Dirección <span class="text-muted font-normal">(opcional)</span></label>
          <input pInputText id="branch-address" formControlName="address" />
        </div>
        <div class="grid sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label for="branch-department" class="text-sm font-medium">Departamento</label>
            <select id="branch-department" formControlName="departmentCode" class="border rounded-md px-2 py-2"
                    (change)="loadCities()">
              <option value="">—</option>
              @for (d of departments(); track d.code) {
                <option [value]="d.code">{{ d.name }}</option>
              }
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label for="branch-city" class="text-sm font-medium">Municipio</label>
            <select id="branch-city" formControlName="cityCode" class="border rounded-md px-2 py-2">
              <option value="">—</option>
              @for (c of cities(); track c.code) {
                <option [value]="c.code">{{ c.name }}</option>
              }
            </select>
            <app-field-error [control]="form.controls.cityCode" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label for="branch-phone" class="text-sm font-medium">Teléfono <span class="text-muted font-normal">(opcional)</span></label>
          <input pInputText id="branch-phone" formControlName="phone" inputmode="tel" />
          <app-field-error [control]="form.controls.phone" />
        </div>
      </div>
    </app-form-dialog>
  `,
})
export class BranchesComponent implements OnInit {
  private readonly api = inject(OrganizationApi);
  private readonly confirm = inject(ConfirmService);
  protected readonly canManage = inject(AuthService).hasPermission('branches:manage');

  protected readonly page = signal<PageResponse<Branch> | null>(null);
  protected readonly loading = signal(true);
  protected readonly editing = signal<Branch | null>(null);
  protected readonly departments = signal<Department[]>([]);
  protected readonly cities = signal<City[]>([]);
  protected dialogOpen = false;
  protected query: TableQuery = initialQuery(20, 'code,asc');

  protected readonly trackById = (row: Branch): string => row.id;
  protected readonly columns: ColumnDef<Branch>[] = [
    { header: 'Código', cell: (b) => b.code, kind: 'mono', sortField: 'code' },
    { header: 'Nombre', cell: (b) => b.name, sortField: 'name' },
    { header: 'Dirección', cell: (b) => b.address, hideOnMobile: true },
    { header: 'Teléfono', cell: (b) => b.phone, hideOnMobile: true },
    { header: 'Estado', cell: (b) => activeStatus(b.active, true), kind: 'status' },
  ];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(CODE_PATTERN)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    address: [''],
    departmentCode: [''],
    cityCode: [''],
    phone: [''],
  });

  ngOnInit(): void {
    this.load(this.query);
    this.api.departments().subscribe((list) => this.departments.set(list));
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api.branches(toPageQuery(query)).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset();
    this.form.controls.code.enable();
    this.cities.set([]);
    this.dialogOpen = true;
  }

  openEdit(branch: Branch): void {
    this.editing.set(branch);
    const departmentCode = branch.cityCode ? branch.cityCode.slice(0, 2) : '';
    this.form.reset({
      code: branch.code,
      name: branch.name,
      address: branch.address ?? '',
      departmentCode,
      cityCode: branch.cityCode ?? '',
      phone: branch.phone ?? '',
    });
    this.form.controls.code.disable();
    this.loadCities(branch.cityCode ?? '');
    this.dialogOpen = true;
  }

  loadCities(keepCity = ''): void {
    const department = this.form.controls.departmentCode.value;
    this.form.controls.cityCode.setValue(keepCity);
    if (!department) {
      this.cities.set([]);
      return;
    }
    this.api.cities(department).subscribe((list) => this.cities.set(list));
  }

  protected readonly saveRequest = (): Observable<unknown> => {
    const value = this.form.getRawValue();
    const input = {
      name: value.name.trim(),
      address: value.address.trim() || null,
      cityCode: value.cityCode || null,
      phone: value.phone.trim() || null,
    };
    const current = this.editing();
    return current ? this.api.updateBranch(current.id, input) : this.api.createBranch(value.code.trim(), input);
  };

  toggle(branch: Branch): void {
    this.confirm.toggleActive({
      active: branch.active,
      noun: 'sucursal',
      name: branch.name,
      consequence: 'No se podrá abrir caja ni vender en ella hasta que la actives de nuevo.',
      accept: () => this.api.setBranchActive(branch.id, !branch.active).subscribe(() => this.load(this.query)),
    });
  }
}
