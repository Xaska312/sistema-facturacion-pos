import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { City, Department, PageResponse, Party, PersonType, PriceList } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { PartiesApi, PartyKind } from '../../core/api/parties.api';
import { AuthService } from '../../core/auth/auth.service';
import { ColumnDef, DataTableComponent } from '../../shared/data-table.component';
import { formatCop } from '../../shared/money';
import { DOCUMENT_TYPES, PartyDraft, draftDv, draftOf, draftProblem, emptyDraft, toPartyInput } from './party-form';

/** Clientes o proveedores (según {@code kind} en los datos de la ruta). */
@Component({
  selector: 'app-parties',
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, TagModule, DataTableComponent],
  template: `
    <div class="flex flex-wrap items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-semibold">{{ isCustomers() ? 'Clientes' : 'Proveedores' }}</h1>
      @if (canManage) {
        <p-button [label]="isCustomers() ? 'Nuevo cliente' : 'Nuevo proveedor'" (onClick)="openCreate()" />
      }
    </div>

    <div class="flex flex-wrap gap-2 mb-3 items-center">
      <input pInputText class="w-full md:w-80" placeholder="Buscar por nombre o documento" [(ngModel)]="search"
             (keyup.enter)="load(0)" />
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" [ngModel]="includeInactive" (ngModelChange)="includeInactive = $event; load(0)" />
        Ver inactivos
      </label>
      <p-button label="Buscar" [text]="true" (onClick)="load(0)" />
    </div>

    <app-data-table [columns]="columns()" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    (pageChange)="load($event)">
      <ng-template #actions let-row>
        <span class="inline-flex gap-2 items-center">
          @if (row.system) {
            <p-tag value="Sistema" severity="info" />
          }
          @if (!row.active) {
            <p-tag value="Inactivo" severity="secondary" />
          }
          @if (canManage && !row.system) {
            <p-button label="Editar" size="small" [text]="true" (onClick)="openEdit(row)" />
            <p-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                      [severity]="row.active ? 'danger' : 'success'" (onClick)="toggle(row)" />
          }
        </span>
      </ng-template>
    </app-data-table>

    <p-dialog [(visible)]="dialogOpen" [modal]="true" [style]="{ width: '40rem' }"
              [header]="(editingId ? 'Editar ' : 'Nuevo ') + (isCustomers() ? 'cliente' : 'proveedor')">
      <div class="grid gap-3 md:grid-cols-2">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Tipo de persona</span>
          <select class="border rounded px-2 py-2" [ngModel]="draft.personType" (ngModelChange)="setPersonType($event)">
            <option value="NATURAL">Persona natural</option>
            <option value="LEGAL">Persona jurídica (empresa)</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Tipo de documento</span>
          <select class="border rounded px-2 py-2" [(ngModel)]="draft.documentType">
            @for (t of documentTypes; track t.value) {
              <option [value]="t.value">{{ t.label }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Número</span>
          <div class="flex items-center gap-2">
            <input pInputText class="flex-1" [(ngModel)]="draft.documentNumber" />
            @if (draft.documentType === 'NIT') {
              <span class="text-sm text-slate-600" title="Dígito de verificación (calculado)">DV {{ dv() ?? '—' }}</span>
            }
          </div>
        </label>
        @if (draft.personType === 'NATURAL') {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Nombres</span>
            <input pInputText [(ngModel)]="draft.firstNames" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Apellidos</span>
            <input pInputText [(ngModel)]="draft.lastNames" />
          </label>
        } @else {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Razón social</span>
            <input pInputText [(ngModel)]="draft.businessName" />
          </label>
        }
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Correo</span>
          <input pInputText type="email" [(ngModel)]="draft.email" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Teléfono</span>
          <input pInputText [(ngModel)]="draft.phone" />
        </label>
        <label class="flex flex-col gap-1 md:col-span-2">
          <span class="text-sm font-medium">Dirección</span>
          <input pInputText [(ngModel)]="draft.address" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Departamento</span>
          <select class="border rounded px-2 py-2" [ngModel]="draft.departmentCode"
                  (ngModelChange)="draft.departmentCode = $event; loadCities('')">
            <option value="">—</option>
            @for (d of departments(); track d.code) {
              <option [value]="d.code">{{ d.name }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Municipio</span>
          <select class="border rounded px-2 py-2" [(ngModel)]="draft.cityCode">
            <option value="">—</option>
            @for (c of cities(); track c.code) {
              <option [value]="c.code">{{ c.name }}</option>
            }
          </select>
        </label>
        @if (isCustomers()) {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Lista de precios</span>
            <select class="border rounded px-2 py-2" [(ngModel)]="draft.priceListId">
              <option value="">General</option>
              @for (l of extraLists(); track l.id) {
                <option [value]="l.id">{{ l.name }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Cupo de crédito</span>
            <input pInputText type="number" min="0" step="1000" [(ngModel)]="draft.creditLimit" />
          </label>
        }
      </div>
      @if (problem(); as message) {
        <p class="text-sm text-amber-700 mt-3">{{ message }}</p>
      }
      <div class="flex justify-end gap-2 mt-4">
        <p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="dialogOpen = false" />
        <p-button label="Guardar" [loading]="saving()" [disabled]="problem() !== null" (onClick)="save()" />
      </div>
    </p-dialog>
  `,
})
export class PartiesComponent implements OnInit {
  /** Desde los datos de la ruta. */
  readonly kind = input<PartyKind>('customers');

  private readonly api = inject(PartiesApi);
  private readonly catalog = inject(CatalogApi);
  private readonly organization = inject(OrganizationApi);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly canManage = inject(AuthService).hasPermission('parties:manage');

  protected readonly documentTypes = DOCUMENT_TYPES;
  protected readonly isCustomers = computed(() => this.kind() === 'customers');
  protected readonly page = signal<PageResponse<Party> | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly departments = signal<Department[]>([]);
  protected readonly cities = signal<City[]>([]);
  protected readonly priceLists = signal<PriceList[]>([]);
  protected readonly extraLists = computed(() => this.priceLists().filter((l) => l.active && !l.defaultList));

  protected search = '';
  protected includeInactive = false;
  protected dialogOpen = false;
  protected editingId: string | null = null;
  protected draft: PartyDraft = emptyDraft();
  private currentPage = 0;

  protected readonly trackById = (row: Party): string => row.id;
  protected readonly columns = computed<ColumnDef<Party>[]>(() => {
    const base: ColumnDef<Party>[] = [
      { header: 'Nombre', cell: (p) => p.displayName },
      { header: 'Documento', cell: (p) => `${p.documentType} ${p.formattedDocument}`, cellClass: 'font-mono' },
      { header: 'Teléfono', cell: (p) => p.phone ?? '—' },
      { header: 'Correo', cell: (p) => p.email ?? '—' },
    ];
    return this.isCustomers()
      ? [...base, { header: 'Lista', cell: (p) => p.priceListName ?? 'General' },
        { header: 'Cupo', cell: (p) => formatCop(p.creditLimit) }]
      : base;
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

  ngOnInit(): void {
    this.organization.departments().subscribe((list) => this.departments.set(list));
    if (this.isCustomers()) {
      this.catalog.priceLists().subscribe((list) => this.priceLists.set(list));
    }
    this.load(0);
  }

  load(page: number): void {
    this.currentPage = page;
    this.loading.set(true);
    this.api.search(this.kind(), { page, size: 20 }, this.search.trim() || null, this.includeInactive).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
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
    this.cities.set([]);
    this.dialogOpen = true;
  }

  openEdit(party: Party): void {
    this.editingId = party.id;
    this.draft = draftOf(party);
    this.loadCities(party.cityCode ?? '');
    this.dialogOpen = true;
  }

  save(): void {
    this.saving.set(true);
    this.api.save(this.kind(), this.editingId, toPartyInput(this.draft, this.isCustomers())).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.dialogOpen = false;
        this.messages.add({ severity: 'success', summary: 'Guardado', detail: saved.displayName });
        this.load(this.currentPage);
      },
      error: () => this.saving.set(false),
    });
  }

  toggle(party: Party): void {
    const activate = !party.active;
    this.confirm.confirm({
      header: activate ? 'Activar' : 'Desactivar',
      message: `¿${activate ? 'Activar' : 'Desactivar'} a ${party.displayName}?`,
      acceptLabel: 'Sí',
      rejectLabel: 'No',
      accept: () => this.api.setActive(this.kind(), party.id, activate).subscribe(() => this.load(this.currentPage)),
    });
  }
}
