import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';
import { City, Department, PageResponse, Party, PersonType, PriceList } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { PartiesApi, PartyKind } from '../../core/api/parties.api';
import { AuthService } from '../../core/auth/auth.service';
import { ConfirmService } from '../../shared/confirm';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusKey, activeStatus } from '../../shared/status';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';
import { DOCUMENT_TYPES, PartyDraft, draftDv, draftOf, draftProblem, emptyDraft, toPartyInput } from './party-form';

/** Clientes o proveedores (según {@code kind} en los datos de la ruta). */
@Component({
  selector: 'app-parties',
  imports: [FormsModule, ButtonModule, InputTextModule, DataTableComponent, PageHeaderComponent, FormDialogComponent],
  template: `
    <app-page-header [title]="isCustomers() ? 'Clientes' : 'Proveedores'"
                     [description]="isCustomers()
                       ? 'Personas y empresas a las que les vendes. Con su lista de precios y cupo de crédito.'
                       : 'Personas y empresas a las que les compras.'">
      @if (canManage) {
        <p-button [label]="isCustomers() ? 'Nuevo cliente' : 'Nuevo proveedor'" icon="pi pi-plus" (onClick)="openCreate()" />
      }
    </app-page-header>

    <app-data-table [columns]="columns()" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    searchPlaceholder="Buscar por nombre o documento" [caption]="isCustomers() ? 'Clientes' : 'Proveedores'"
                    [emptyIcon]="isCustomers() ? 'pi pi-users' : 'pi pi-truck'"
                    [emptyTitle]="isCustomers() ? 'Aún no hay clientes' : 'Aún no hay proveedores'"
                    [emptyMessage]="isCustomers()
                      ? 'Registra a tus clientes frecuentes para venderles con su lista de precios.'
                      : 'Registra a quienes te venden mercancía.'"
                    [emptyActionLabel]="canManage ? (isCustomers() ? 'Crear cliente' : 'Crear proveedor') : null"
                    (emptyAction)="openCreate()" (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <input type="checkbox" [ngModel]="includeInactive" (ngModelChange)="includeInactive = $event; reloadFirstPage()" />
        Ver inactivos
      </label>
      <ng-template #actions let-row>
        @if (canManage && !row.system) {
          <p-button label="Editar" icon="pi pi-pencil" size="small" [text]="true" (onClick)="openEdit(row)" />
          <p-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                    [icon]="row.active ? 'pi pi-ban' : 'pi pi-check-circle'"
                    [severity]="row.active ? 'danger' : 'success'" (onClick)="toggle(row)" />
        }
      </ng-template>
    </app-data-table>

    <app-form-dialog [(visible)]="dialogOpen" width="40rem"
                     [header]="(editingId ? 'Editar ' : 'Nuevo ') + (isCustomers() ? 'cliente' : 'proveedor')"
                     [dirty]="draftDirty()" [invalidMessage]="problem()" [save]="saveRequest"
                     [successMessage]="isCustomers() ? 'Cliente guardado' : 'Proveedor guardado'" (saved)="load(query)">
      <div class="grid gap-3 md:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label for="party-person" class="text-sm font-medium">Tipo de persona</label>
          <select id="party-person" class="border rounded-md px-2 py-2" [ngModel]="draft.personType"
                  (ngModelChange)="setPersonType($event)">
            <option value="NATURAL">Persona natural</option>
            <option value="LEGAL">Persona jurídica (empresa)</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="party-doctype" class="text-sm font-medium">Tipo de documento</label>
          <select id="party-doctype" class="border rounded-md px-2 py-2" [(ngModel)]="draft.documentType">
            @for (t of documentTypes; track t.value) {
              <option [value]="t.value">{{ t.label }}</option>
            }
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="party-number" class="text-sm font-medium">Número</label>
          <div class="flex items-center gap-2">
            <input pInputText id="party-number" class="flex-1 min-w-0" inputmode="numeric" [(ngModel)]="draft.documentNumber" />
            @if (draft.documentType === 'NIT') {
              <span class="text-sm text-muted" title="Dígito de verificación, se calcula solo">DV {{ dv() ?? '—' }}</span>
            }
          </div>
          @if (draft.documentType === 'NIT') {
            <small class="text-xs text-muted">Escribe el NIT sin el dígito de verificación.</small>
          }
        </div>
        @if (draft.personType === 'NATURAL') {
          <div class="flex flex-col gap-1">
            <label for="party-first" class="text-sm font-medium">Nombres</label>
            <input pInputText id="party-first" [(ngModel)]="draft.firstNames" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="party-last" class="text-sm font-medium">Apellidos</label>
            <input pInputText id="party-last" [(ngModel)]="draft.lastNames" />
          </div>
        } @else {
          <div class="flex flex-col gap-1">
            <label for="party-business" class="text-sm font-medium">Razón social</label>
            <input pInputText id="party-business" [(ngModel)]="draft.businessName" />
          </div>
        }
        <div class="flex flex-col gap-1">
          <label for="party-email" class="text-sm font-medium">Correo <span class="text-muted font-normal">(opcional)</span></label>
          <input pInputText id="party-email" type="email" [(ngModel)]="draft.email" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="party-phone" class="text-sm font-medium">Teléfono <span class="text-muted font-normal">(opcional)</span></label>
          <input pInputText id="party-phone" inputmode="tel" [(ngModel)]="draft.phone" />
        </div>
        <div class="flex flex-col gap-1 md:col-span-2">
          <label for="party-address" class="text-sm font-medium">Dirección <span class="text-muted font-normal">(opcional)</span></label>
          <input pInputText id="party-address" [(ngModel)]="draft.address" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="party-department" class="text-sm font-medium">Departamento</label>
          <select id="party-department" class="border rounded-md px-2 py-2" [ngModel]="draft.departmentCode"
                  (ngModelChange)="draft.departmentCode = $event; loadCities('')">
            <option value="">—</option>
            @for (d of departments(); track d.code) {
              <option [value]="d.code">{{ d.name }}</option>
            }
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="party-city" class="text-sm font-medium">Municipio</label>
          <select id="party-city" class="border rounded-md px-2 py-2" [(ngModel)]="draft.cityCode">
            <option value="">—</option>
            @for (c of cities(); track c.code) {
              <option [value]="c.code">{{ c.name }}</option>
            }
          </select>
        </div>
        @if (isCustomers()) {
          <div class="flex flex-col gap-1">
            <label for="party-list" class="text-sm font-medium">Lista de precios</label>
            <select id="party-list" class="border rounded-md px-2 py-2" [(ngModel)]="draft.priceListId">
              <option value="">General</option>
              @for (l of extraLists(); track l.id) {
                <option [value]="l.id">{{ l.name }}</option>
              }
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label for="party-credit" class="text-sm font-medium">Cupo de crédito</label>
            <input pInputText id="party-credit" type="number" min="0" step="1000" [(ngModel)]="draft.creditLimit" />
            <small class="text-xs text-muted">Valor máximo que puede quedar debiendo. 0 = no se le fía.</small>
          </div>
        }
      </div>
    </app-form-dialog>
  `,
})
export class PartiesComponent implements OnInit {
  /** Desde los datos de la ruta. */
  readonly kind = input<PartyKind>('customers');

  private readonly api = inject(PartiesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly organization = inject(OrganizationApi);
  private readonly confirm = inject(ConfirmService);
  protected readonly canManage = inject(AuthService).hasPermission('parties:manage');

  protected readonly documentTypes = DOCUMENT_TYPES;
  protected readonly isCustomers = computed(() => this.kind() === 'customers');
  protected readonly page = signal<PageResponse<Party> | null>(null);
  protected readonly loading = signal(true);
  protected readonly departments = signal<Department[]>([]);
  protected readonly cities = signal<City[]>([]);
  protected readonly priceLists = signal<PriceList[]>([]);
  protected readonly extraLists = computed(() => this.priceLists().filter((l) => l.active && !l.defaultList));

  protected includeInactive = false;
  protected dialogOpen = false;
  protected editingId: string | null = null;
  protected draft: PartyDraft = emptyDraft();
  /** Copia del borrador al abrir el diálogo, para saber si hay cambios sin guardar. */
  private draftSnapshot = '';
  protected query: TableQuery = initialQuery();

  protected readonly trackById = (row: Party): string => row.id;
  protected readonly columns = computed<ColumnDef<Party>[]>(() => {
    const base: ColumnDef<Party>[] = [
      { header: 'Nombre', cell: (p) => p.displayName },
      { header: 'Documento', cell: (p) => `${p.documentType} ${p.formattedDocument}`, kind: 'mono' },
      { header: 'Teléfono', cell: (p) => p.phone, hideOnMobile: true },
      { header: 'Correo', cell: (p) => p.email, hideOnMobile: true },
    ];
    const status: ColumnDef<Party> = { header: 'Estado', cell: (p) => partyStatus(p), kind: 'status' };
    return this.isCustomers()
      ? [...base, { header: 'Lista', cell: (p) => p.priceListName ?? 'General', hideOnMobile: true },
        { header: 'Cupo', cell: (p) => p.creditLimit, kind: 'money' }, status]
      : [...base, status];
  });

  protected setPersonType(value: PersonType): void {
    this.draft.personType = value;
    if (value === 'LEGAL') {
      this.draft.documentType = 'NIT';
    }
  }

  protected dv(): number | null {
    return draftDv(this.draft);
  }

  protected problem(): string | null {
    return draftProblem(this.draft);
  }

  protected draftDirty(): boolean {
    return JSON.stringify(this.draft) !== this.draftSnapshot;
  }

  ngOnInit(): void {
    this.organization.departments().subscribe((list) => this.departments.set(list));
    if (this.isCustomers()) {
      this.catalog.priceLists().subscribe((list) => this.priceLists.set(list));
    }
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api.search(this.kind(), toPageQuery(query), query.search, this.includeInactive).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  reloadFirstPage(): void {
    this.load({ ...this.query, page: 0 });
  }

  loadCities(keepCity: string): void {
    this.draft.cityCode = keepCity;
    if (!this.draft.departmentCode) {
      this.cities.set([]);
      return;
    }
    this.organization.cities(this.draft.departmentCode).subscribe((list) => this.cities.set(list));
  }

  openCreate(): void {
    this.editingId = null;
    this.draft = emptyDraft();
    this.draftSnapshot = JSON.stringify(this.draft);
    this.cities.set([]);
    this.dialogOpen = true;
  }

  openEdit(party: Party): void {
    this.editingId = party.id;
    this.draft = draftOf(party);
    this.loadCities(party.cityCode ?? '');
    this.draftSnapshot = JSON.stringify(this.draft);
    this.dialogOpen = true;
  }

  protected readonly saveRequest = (): Observable<unknown> =>
    this.api.save(this.kind(), this.editingId, toPartyInput(this.draft, this.isCustomers()));

  toggle(party: Party): void {
    this.confirm.toggleActive({
      active: party.active,
      noun: this.isCustomers() ? 'cliente' : 'proveedor',
      name: party.displayName,
      consequence: this.isCustomers() ? 'No aparecerá al buscar clientes en la venta.' : undefined,
      accept: () => this.api.setActive(this.kind(), party.id, !party.active).subscribe(() => this.load(this.query)),
    });
  }
}

function partyStatus(party: Party): StatusKey {
  return party.system ? 'system' : activeStatus(party.active);
}
