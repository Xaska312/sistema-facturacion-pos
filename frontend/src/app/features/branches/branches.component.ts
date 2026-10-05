import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { Branch, City, Department, PageResponse } from '../../core/api/api.models';
import { OrganizationApi } from '../../core/api/organization.api';
import { ColumnDef, DataTableComponent } from '../../shared/data-table.component';
import { HasPermissionDirective } from '../../shared/has-permission.directive';

@Component({
  selector: 'app-branches',
  imports: [ReactiveFormsModule, ButtonModule, DialogModule, InputTextModule, TagModule, DataTableComponent,
    HasPermissionDirective],
  template: `
    <div class="flex items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-semibold">Sucursales</h1>
      <p-button *hasPermission="'branches:manage'" label="Nueva sucursal" (onClick)="openCreate()" />
    </div>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    (pageChange)="load($event)">
      <ng-template #actions let-row>
        <span class="inline-flex gap-2 items-center">
          <p-tag [value]="row.active ? 'Activa' : 'Inactiva'" [severity]="row.active ? 'success' : 'secondary'" />
          <ng-container *hasPermission="'branches:manage'">
            <p-button label="Editar" size="small" [text]="true" (onClick)="openEdit(row)" />
            <p-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                      [severity]="row.active ? 'danger' : 'success'" (onClick)="toggle(row)" />
          </ng-container>
        </span>
      </ng-template>
    </app-data-table>

    <p-dialog [(visible)]="dialogOpen" [modal]="true" [header]="editing() ? 'Editar sucursal' : 'Nueva sucursal'"
              [style]="{ width: '32rem' }">
      <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-3">
        @if (!editing()) {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Código</span>
            <input pInputText formControlName="code" placeholder="NORTE" />
            <small class="text-muted">No se puede cambiar después.</small>
          </label>
        }
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Nombre</span>
          <input pInputText formControlName="name" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Dirección</span>
          <input pInputText formControlName="address" />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Departamento</span>
            <select formControlName="departmentCode" class="border rounded px-2 py-2" (change)="loadCities()">
              <option value="">—</option>
              @for (d of departments(); track d.code) {
                <option [value]="d.code">{{ d.name }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Municipio</span>
            <select formControlName="cityCode" class="border rounded px-2 py-2">
              <option value="">—</option>
              @for (c of cities(); track c.code) {
                <option [value]="c.code">{{ c.name }}</option>
              }
            </select>
          </label>
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Teléfono</span>
          <input pInputText formControlName="phone" />
        </label>
        <div class="flex justify-end gap-2 mt-2">
          <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="dialogOpen = false" />
          <p-button type="submit" label="Guardar" [loading]="saving()" [disabled]="form.invalid" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class BranchesComponent implements OnInit {
  private readonly api = inject(OrganizationApi);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly page = signal<PageResponse<Branch> | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly editing = signal<Branch | null>(null);
  protected readonly departments = signal<Department[]>([]);
  protected readonly cities = signal<City[]>([]);
  protected dialogOpen = false;
  private currentPage = 0;

  protected readonly trackById = (row: Branch): string => row.id;
  protected readonly columns: ColumnDef<Branch>[] = [
    { header: 'Código', cell: (b) => b.code, cellClass: 'font-mono' },
    { header: 'Nombre', cell: (b) => b.name },
    { header: 'Dirección', cell: (b) => b.address ?? '—' },
    { header: 'Municipio', cell: (b) => b.cityCode ?? '—', cellClass: 'font-mono' },
  ];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_-]{2,20}$/)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    address: [''],
    departmentCode: [''],
    cityCode: [''],
    phone: [''],
  });

  ngOnInit(): void {
    this.load(0);
    this.api.departments().subscribe((list) => this.departments.set(list));
  }

  load(page: number): void {
    this.currentPage = page;
    this.loading.set(true);
    this.api.branches({ page, size: 20, sort: 'code,asc' }).subscribe({
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

  save(): void {
    const value = this.form.getRawValue();
    const input = {
      name: value.name.trim(),
      address: value.address.trim() || null,
      cityCode: value.cityCode || null,
      phone: value.phone.trim() || null,
    };
    const current = this.editing();
    this.saving.set(true);
    const request = current ? this.api.updateBranch(current.id, input) : this.api.createBranch(value.code, input);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogOpen = false;
        this.messages.add({ severity: 'success', summary: 'Sucursal guardada' });
        this.load(this.currentPage);
      },
      error: () => this.saving.set(false),
    });
  }

  toggle(branch: Branch): void {
    const activate = !branch.active;
    this.confirm.confirm({
      header: activate ? 'Activar sucursal' : 'Desactivar sucursal',
      message: `¿${activate ? 'Activar' : 'Desactivar'} la sucursal ${branch.name}?`,
      acceptLabel: 'Sí',
      rejectLabel: 'No',
      accept: () => this.api.setBranchActive(branch.id, activate).subscribe(() => this.load(this.currentPage)),
    });
  }
}
