import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';
import { SizeEntry, SizeScale } from '../../../core/api/api.models';
import { CatalogApi } from '../../../core/api/catalog.api';
import { permissionFlag } from '../../../core/auth/permission-flag';
import { ConfirmService } from '../../../shared/confirm';
import { FormDialogComponent } from '../../../shared/forms/form-dialog.component';
import { PageHeaderComponent } from '../../../shared/page-header.component';
import { activeStatus } from '../../../shared/status';
import { CellTemplateDirective } from '../../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../../shared/table/data-table.component';
import { ColumnDef } from '../../../shared/table/table';
import { parseSizeList, scaleProblem } from './size-scale-form';

/** Escalas de tallas (fase 8d): las que trae el sistema (calzado, ropa) y las propias del negocio. */
@Component({
  selector: 'app-size-scales',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, DataTableComponent, CellTemplateDirective,
    PageHeaderComponent, FormDialogComponent],
  template: `
    <app-page-header title="Escalas de tallas"
                     description="Las tallas que eliges al crear un modelo. Puedes escribir la equivalencia de cada talla (p. ej. 38 = EU 39 / US 7) según tus marcas.">
      <a pButton routerLink="/app/productos/modelos" label="Productos con tallas" icon="pi pi-arrow-left"
         severity="secondary" [text]="true"></a>
      @if (canManage()) {
        <p-button label="Nueva escala" icon="pi pi-plus" (onClick)="openCreate()" />
      }
    </app-page-header>

    <app-data-table [columns]="columns" [items]="scales()" [loading]="loading()" [trackBy]="trackById"
                    caption="Escalas de tallas" emptyIcon="pi pi-sliders-h" emptyTitle="No hay escalas de tallas">
      <ng-template appCell="sizes" let-row>
        <span class="text-sm">{{ sizesText(row) }}</span>
      </ng-template>
      <ng-template #actions let-row>
        @if (canManage()) {
          <p-button label="Editar" icon="pi pi-pencil" size="small" [text]="true" (onClick)="openEdit(row)" />
          <p-button [label]="row.active ? 'Desactivar' : 'Activar'" size="small" [text]="true"
                    [icon]="row.active ? 'pi pi-ban' : 'pi pi-check-circle'"
                    [severity]="row.active ? 'danger' : 'success'" (onClick)="toggle(row)" />
        }
      </ng-template>
    </app-data-table>

    <app-form-dialog [(visible)]="dialogOpen" width="34rem" [header]="editing ? 'Editar escala' : 'Nueva escala'"
                     [dirty]="draftJson() !== snapshot" [invalidMessage]="problem()" [save]="saveRequest"
                     successMessage="Escala guardada" (saved)="reload()">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label for="scale-name" class="text-sm font-medium">Nombre</label>
          <input pInputText id="scale-name" [(ngModel)]="name" maxlength="60" placeholder="Calzado dama" />
        </div>

        <div class="flex flex-col gap-1">
          <label for="scale-quick" class="text-sm font-medium">Agregar varias tallas</label>
          <div class="flex gap-2">
            <input pInputText id="scale-quick" class="flex-1" [(ngModel)]="quick" placeholder="34-40 o S, M, L"
                   autocomplete="off" (keydown.enter)="addQuick($event)" />
            <p-button label="Agregar" [outlined]="true" (onClick)="addQuick()" [disabled]="!quick.trim()" />
          </div>
          <small class="text-xs text-muted">Un rango de números (34-40) o tallas separadas por comas. Las repetidas se omiten.</small>
        </div>

        <div class="flex flex-col gap-2">
          <div class="grid grid-cols-12 gap-2 text-xs text-muted">
            <span class="col-span-3">Talla</span>
            <span class="col-span-6">Equivalencia (opcional)</span>
          </div>
          @for (size of sizes; track $index; let i = $index; let first = $first; let last = $last) {
            <div class="grid grid-cols-12 gap-2 items-center">
              <input pInputText class="col-span-3 uppercase" [(ngModel)]="size.label" maxlength="10"
                     [attr.aria-label]="'Talla ' + (i + 1)" />
              <input pInputText class="col-span-6" [(ngModel)]="size.equivalent" maxlength="40" placeholder="EU 39 / US 7"
                     [attr.aria-label]="'Equivalencia de la talla ' + (size.label || i + 1)" />
              <span class="col-span-3 flex justify-end">
                <p-button icon="pi pi-arrow-up" size="small" [text]="true" severity="secondary" [disabled]="first"
                          (onClick)="move(i, -1)" [ariaLabel]="'Subir talla ' + size.label" />
                <p-button icon="pi pi-arrow-down" size="small" [text]="true" severity="secondary" [disabled]="last"
                          (onClick)="move(i, 1)" [ariaLabel]="'Bajar talla ' + size.label" />
                <p-button icon="pi pi-times" size="small" [text]="true" severity="danger" (onClick)="remove(i)"
                          [ariaLabel]="'Quitar talla ' + size.label" />
              </span>
            </div>
          } @empty {
            <p class="text-sm text-muted">Sin tallas todavía.</p>
          }
          <div>
            <p-button label="Agregar una talla" icon="pi pi-plus" size="small" [text]="true" (onClick)="addOne()" />
          </div>
          @if (editing) {
            <small class="text-xs text-muted">Una talla que ya usa algún producto no se puede quitar.</small>
          }
        </div>
      </div>
    </app-form-dialog>
  `,
})
export class SizeScalesComponent implements OnInit {
  private readonly api = inject(CatalogApi);
  private readonly confirm = inject(ConfirmService);
  protected readonly canManage = permissionFlag('products:manage');

  protected readonly scales = signal<SizeScale[]>([]);
  protected readonly loading = signal(true);
  protected readonly trackById = (row: SizeScale): string => row.id;
  protected readonly columns: ColumnDef<SizeScale>[] = [
    { header: 'Nombre', cell: (s) => s.name },
    { header: 'Tallas', cell: (s) => s.sizes.length, template: 'sizes' },
    { header: 'Estado', cell: (s) => activeStatus(s.active, true), kind: 'status' },
  ];

  protected dialogOpen = false;
  protected editing: SizeScale | null = null;
  protected name = '';
  protected quick = '';
  protected sizes: SizeEntry[] = [];
  protected snapshot = '';

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.sizeScales().subscribe({
      next: (list) => {
        this.scales.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected sizesText(scale: SizeScale): string {
    const labels = scale.sizes.map((s) => s.label);
    return labels.length > 14 ? `${labels.slice(0, 14).join(' · ')} … (${labels.length})` : labels.join(' · ');
  }

  openCreate(): void {
    this.open(null);
  }

  openEdit(scale: SizeScale): void {
    this.open(scale);
  }

  protected problem(): string | null {
    return scaleProblem(this.name, this.sizes);
  }

  protected draftJson(): string {
    return JSON.stringify([this.name.trim(), this.cleanSizes()]);
  }

  protected addQuick(event?: Event): void {
    event?.preventDefault();
    const existing = new Set(this.sizes.map((s) => s.label.trim().toUpperCase()));
    for (const label of parseSizeList(this.quick)) {
      if (!existing.has(label)) {
        existing.add(label);
        this.sizes.push({ label, equivalent: '' });
      }
    }
    this.quick = '';
  }

  protected addOne(): void {
    this.sizes.push({ label: '', equivalent: '' });
  }

  protected move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.sizes.length) {
      return;
    }
    [this.sizes[index], this.sizes[target]] = [this.sizes[target], this.sizes[index]];
  }

  protected remove(index: number): void {
    this.sizes.splice(index, 1);
  }

  protected readonly saveRequest = (): Observable<unknown> =>
    this.api.saveSizeScale(this.editing?.id ?? null, {
      name: this.name.trim(),
      active: this.editing?.active ?? true,
      sizes: this.cleanSizes(),
    });

  toggle(scale: SizeScale): void {
    this.confirm.toggleActive({
      active: scale.active,
      noun: 'escala',
      name: scale.name,
      consequence: 'No se podrá elegir en modelos nuevos. Los modelos que ya la usan siguen igual.',
      accept: () => this.api.saveSizeScale(scale.id, { name: scale.name, active: !scale.active, sizes: scale.sizes })
        .subscribe(() => this.reload()),
    });
  }

  private open(scale: SizeScale | null): void {
    this.editing = scale;
    this.name = scale?.name ?? '';
    this.quick = '';
    this.sizes = (scale?.sizes ?? []).map((s) => ({ label: s.label, equivalent: s.equivalent ?? '' }));
    this.snapshot = this.draftJson();
    this.dialogOpen = true;
  }

  private cleanSizes(): SizeEntry[] {
    return this.sizes.map((s) => ({
      label: s.label.trim().toUpperCase(),
      equivalent: (s.equivalent ?? '').trim() || null,
    }));
  }
}
