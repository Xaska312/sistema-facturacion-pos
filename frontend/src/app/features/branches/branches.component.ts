import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../../shared/ui/button.component';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { Observable, map, of, switchMap } from 'rxjs';
import { Branch, BranchSetupResult, City, Department, PageResponse } from '../../core/api/api.models';
import { BusinessProfile, BusinessProfileApi } from '../../core/api/business-profile.api';
import { CatalogApi } from '../../core/api/catalog.api';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import {
  BRANCH_KINDS, BranchKind, SetupDraft, categoryOptions, defaultRegisterName, emptyDraft, setupInput, setupProblem,
  toggleId, withTableModules,
} from './branch-setup';
import { OrganizationApi } from '../../core/api/organization.api';
import { ConfirmService } from '../../shared/confirm';
import { FieldErrorComponent } from '../../shared/forms/field-error.component';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { activeStatus } from '../../shared/status';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';
import { permissionFlag } from '../../core/auth/permission-flag';
import { LatestRequest } from '../../shared/latest-request';

const CODE_PATTERN = /^[A-Za-z0-9_-]{2,20}$/;

@Component({
  selector: 'app-branches',
  imports: [ReactiveFormsModule, ButtonComponent, AppInputDirective, DataTableComponent, PageHeaderComponent,
    FormDialogComponent, FieldErrorComponent],
  template: `
    <app-page-header title="Sucursales"
                     description="Los puntos de venta de tu negocio. Cada caja y cada existencia pertenecen a una sucursal.">
      @if (canManage()) {
        <app-button label="Nueva sucursal" icon="pi pi-plus" (clicked)="openCreate()" />
      }
    </app-page-header>

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    initialSort="code,asc" caption="Sucursales del negocio" emptyIcon="pi pi-building"
                    emptyTitle="Aún no hay sucursales" emptyMessage="Crea una sucursal por cada local donde vendes."
                    [emptyActionLabel]="canManage() ? 'Crear sucursal' : null" (emptyAction)="openCreate()"
                    (queryChange)="load($event)">
      <ng-template #actions let-row>
        @if (canManage()) {
          <app-button label="Editar" icon="pi pi-pencil" size="small" [text]="true" (clicked)="openEdit(row)" />
          <app-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                    [icon]="row.active ? 'pi pi-ban' : 'pi pi-check-circle'"
                    [severity]="row.active ? 'danger' : 'success'" (clicked)="toggle(row)" />
        }
      </ng-template>
    </app-data-table>

    <app-form-dialog [(visible)]="dialogOpen" [header]="editing() ? 'Editar sucursal' : 'Nueva sucursal'" [form]="form"
                     width="36rem" [save]="saveRequest" [dirty]="draftDirty()" [invalidMessage]="problem()"
                     [submitLabel]="editing() ? 'Guardar' : 'Crear sucursal'" successMessage="Sucursal guardada"
                     (saved)="onSaved($event)">
      <div [formGroup]="form" class="flex flex-col gap-3">
        @if (!editing()) {
          <div class="flex flex-col gap-1">
            <label for="branch-code" class="text-sm font-medium">Código</label>
            <input appInput id="branch-code" formControlName="code" placeholder="NORTE" autocomplete="off"
                   aria-describedby="branch-code-help" />
            <small id="branch-code-help" class="text-xs text-muted">Corto y sin espacios. No se puede cambiar después.</small>
            <app-field-error [control]="form.controls.code"
                             patternMessage="Usa de 2 a 20 letras, números, guiones o guiones bajos (sin espacios)." />
          </div>
        }
        <div class="flex flex-col gap-1">
          <label for="branch-name" class="text-sm font-medium">Nombre</label>
          <input appInput id="branch-name" formControlName="name" placeholder="Sede norte" (input)="syncRegisterName()" />
          <app-field-error [control]="form.controls.name" />
        </div>

        @if (!editing()) {
          <fieldset class="flex flex-col gap-2">
            <legend class="text-sm font-medium mb-1">¿Qué tendrá esta sede?</legend>
            <div class="grid sm:grid-cols-3 gap-2">
              @for (k of kinds; track k.kind) {
                <label class="kind" [class.kind--on]="draft().kind === k.kind">
                  <input type="radio" name="branch-kind" class="sr-only" [checked]="draft().kind === k.kind"
                         (change)="setKind(k.kind)" />
                  <i [class]="k.icon + ' text-lg'" aria-hidden="true"></i>
                  <span class="font-semibold text-sm">{{ k.title }}</span>
                  <span class="text-xs text-muted">{{ k.hint }}</span>
                </label>
              }
            </div>
          </fieldset>

          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" class="mt-1 size-4" [checked]="draft().createRegister"
                   (change)="patch({ createRegister: $any($event.target).checked })" />
            <span><span class="font-semibold">Crear su caja</span>
              <span class="block text-xs text-muted">Para que la plata de esta sede no se mezcle con la de las otras.</span></span>
          </label>
          @if (draft().createRegister) {
            <div class="flex flex-col gap-1 pl-6">
              <label for="branch-register" class="text-sm font-medium">Nombre de la caja</label>
              <input appInput id="branch-register" maxlength="120" [value]="draft().registerName"
                     (input)="registerTouched = true; patch({ registerName: $any($event.target).value })" />
            </div>
          }

          @if (draft().kind === 'restaurant') {
            <div class="flex flex-col gap-1">
              <label for="branch-tables" class="text-sm font-medium">¿Cuántas mesas tiene?</label>
              <input appInput id="branch-tables" type="number" inputmode="numeric" min="1" max="60" class="max-w-32"
                     [value]="draft().tables" (input)="patch({ tables: +$any($event.target).value })" />
              <small class="text-xs text-muted">Quedan en una zona "Salón", numeradas desde 1. Después puedes agregar zonas
                (terraza, segundo piso) y mover las mesas en el plano.</small>
            </div>
            @if (!hasTables()) {
              <p class="note" role="note">
                @if (profile()?.canEdit) {
                  Se encenderán <b>Mesas</b> y <b>Cocina</b> para tu negocio.
                } @else {
                  Tu negocio no tiene <b>Mesas</b> encendido. Pídele al dueño que lo encienda en Ajustes.
                }
              </p>
            }
          }
        }

        @if (editing() || draft().kind !== 'same') {
          <fieldset class="flex flex-col gap-2">
            <legend class="text-sm font-medium mb-1">
              {{ draft().kind === 'restaurant' && !editing() ? '¿Qué se ofrece en las mesas?' : '¿Qué vende esta sede?' }}
            </legend>
            @if (editing()) {
              <div class="flex flex-wrap gap-4 text-sm">
                <label class="flex items-center gap-2">
                  <input type="radio" name="sells" class="size-4" [checked]="sellsAll()" (change)="setSellsAll(true)" />
                  Todo el catálogo
                </label>
                <label class="flex items-center gap-2">
                  <input type="radio" name="sells" class="size-4" [checked]="!sellsAll()" (change)="setSellsAll(false)" />
                  Solo algunas categorías
                </label>
              </div>
            }
            @if (!editing() || !sellsAll()) {
              @if (categories().length === 0) {
                <p class="text-xs text-muted">Aún no tienes categorías. Créalas en Productos › Categorías.</p>
              } @else {
                <div class="flex flex-wrap gap-2">
                  @for (c of categories(); track c.id) {
                    <label class="chip chip--toggle" [class.chip--on]="draft().categoryIds.includes(c.id)">
                      <input type="checkbox" class="sr-only" [checked]="draft().categoryIds.includes(c.id)"
                             (change)="toggleCategory(c.id)" />
                      {{ c.label }}
                    </label>
                  }
                </div>
              }
              <small class="text-xs text-muted">
                @if (draft().kind === 'restaurant' && !editing()) {
                  Serán su carta y lo único que sale en su Vender. Si no eliges ninguna, vende todo el catálogo.
                } @else {
                  En Vender de esta sede solo salen estas categorías (y sus subcategorías).
                }
                Los productos y los precios son los mismos para todo el negocio.
              </small>
            }
          </fieldset>
        }
        <div class="flex flex-col gap-1">
          <label for="branch-address" class="text-sm font-medium">Dirección <span class="text-muted font-normal">(opcional)</span></label>
          <input appInput id="branch-address" formControlName="address" />
        </div>
        <div class="grid sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label for="branch-department" class="text-sm font-medium">Departamento</label>
            <select id="branch-department" formControlName="departmentCode" class="border rounded-[10px] px-3 min-h-11"
                    (change)="loadCities()">
              <option value="">—</option>
              @for (d of departments(); track d.code) {
                <option [value]="d.code">{{ d.name }}</option>
              }
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label for="branch-city" class="text-sm font-medium">Municipio</label>
            <select id="branch-city" formControlName="cityCode" class="border rounded-[10px] px-3 min-h-11">
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
          <input appInput id="branch-phone" formControlName="phone" inputmode="tel" />
          <app-field-error [control]="form.controls.phone" />
        </div>
      </div>
    </app-form-dialog>
  `,
  styles: `
    .kind {
      display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem; min-height: 6rem; cursor: pointer;
      border: 1px solid var(--surface-border); border-radius: 12px;
    }
    .kind--on { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-soft-text); }
    .kind:has(input:focus-visible), .chip--toggle:has(input:focus-visible) {
      outline: 2px solid var(--focus-ring); outline-offset: 2px;
    }
    .chip {
      display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0.125rem 0.75rem; border-radius: 9999px;
      background: var(--surface-alt); font-size: 0.875rem; font-weight: 600; cursor: pointer;
      border: 1px solid var(--surface-border);
    }
    .chip--on { background: var(--brand-soft); color: var(--brand-soft-text); border-color: var(--brand); }
    .note { font-size: 0.8125rem; padding: 0.5rem 0.75rem; border-radius: 10px; background: var(--surface-alt); }
  `,
})
export class BranchesComponent implements OnInit {
  /** Cancela la petición anterior de la lista (QA UI-10). */
  private readonly latest = new LatestRequest();
  private readonly api = inject(OrganizationApi);
  private readonly confirm = inject(ConfirmService);
  private readonly catalog = inject(CatalogApi);
  private readonly profiles = inject(BusinessProfileApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly canManage = permissionFlag('branches:manage');

  // Asistente y "qué vende" (decisión 378).
  protected readonly kinds = BRANCH_KINDS;
  protected readonly draft = signal<SetupDraft>(emptyDraft());
  /** Al editar: vende todo el catálogo o solo las categorías del borrador. */
  protected readonly sellsAll = signal(true);
  protected readonly draftDirty = signal(false);
  protected readonly categories = signal<{ id: string; label: string }[]>([]);
  protected readonly profile = signal<BusinessProfile | null>(null);
  protected readonly hasTables = signal(false);
  /** El usuario escribió el nombre de la caja: ya no se sigue el de la sucursal. */
  protected registerTouched = false;
  protected readonly problem = computed(() => {
    if (this.editing()) {
      return !this.sellsAll() && this.draft().categoryIds.length === 0
        ? 'Elige al menos una categoría que se venda en esta sede.' : null;
    }
    const problem = setupProblem(this.draft());
    if (!problem && this.draft().kind === 'restaurant' && !this.hasTables() && !this.profile()?.canEdit) {
      return 'Para crear mesas, el dueño debe encender Mesas en Ajustes.';
    }
    return problem;
  });

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
    this.api.branches(toPageQuery(query)).pipe(this.latest.only()).subscribe({
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
    this.resetDraft();
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
    this.resetDraft();
    this.api.saleCategories(branch.id).subscribe({
      next: (sale) => {
        this.sellsAll.set(sale.sellsAll);
        this.draft.update((d) => ({ ...d, categoryIds: sale.categoryIds }));
      },
      error: () => undefined,
    });
    this.dialogOpen = true;
  }

  protected setKind(kind: BranchKind): void {
    this.patch({ kind });
  }

  protected patch(change: Partial<SetupDraft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
    this.draftDirty.set(true);
  }

  protected toggleCategory(id: string): void {
    this.patch({ categoryIds: toggleId(this.draft().categoryIds, id) });
  }

  protected setSellsAll(all: boolean): void {
    this.sellsAll.set(all);
    this.draftDirty.set(true);
  }

  /** El nombre de la caja sigue al de la sucursal hasta que lo cambien a mano. */
  protected syncRegisterName(): void {
    if (!this.editing() && !this.registerTouched) {
      this.draft.update((d) => ({ ...d, registerName: defaultRegisterName(this.form.controls.name.value) }));
    }
  }

  private resetDraft(): void {
    this.draft.set(emptyDraft());
    this.sellsAll.set(true);
    this.draftDirty.set(false);
    this.registerTouched = false;
    this.hasTables.set(this.auth.hasPermission('module:tables'));
    this.catalog.categories().subscribe({ next: (list) => this.categories.set(categoryOptions(list)), error: () => undefined });
    this.profiles.get().subscribe({ next: (p) => this.profile.set(p), error: () => this.profile.set(null) });
  }

  protected onSaved(result: unknown): void {
    this.load(this.query);
    const notes = (result as Partial<BranchSetupResult> | null)?.notes ?? [];
    for (const note of notes) {
      this.toast.add({ severity: 'info', summary: 'Para tener en cuenta', detail: note, life: 9000 });
    }
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
    if (current) {
      const sellsAll = this.sellsAll();
      return this.api.updateBranch(current.id, input).pipe(
        switchMap((branch) => this.api.setSaleCategories(current.id, sellsAll, sellsAll ? [] : this.draft().categoryIds)
          .pipe(map(() => branch))));
    }
    const draft = this.draft();
    const request = setupInput(value.code, input, draft);
    // Un restaurante necesita Mesas y Cocina: el dueño los enciende aquí mismo y se renueva la sesión (los permisos
    // viajan en el token) antes de crear las mesas.
    const profile = this.profile();
    const enable: Observable<unknown> = draft.kind === 'restaurant' && !this.hasTables() && profile?.canEdit
      ? this.profiles.change(profile.businessType, withTableModules(profile.modules)).pipe(
        switchMap(() => this.auth.renew()), map(() => this.hasTables.set(true)))
      : of(null);
    return enable.pipe(switchMap(() => this.api.setupBranch(request)));
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
