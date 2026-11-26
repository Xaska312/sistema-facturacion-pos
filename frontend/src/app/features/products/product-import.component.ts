import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '../../shared/ui/toast.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { ImportReport, ImportRowError } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { saveDownload } from '../../shared/download';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef } from '../../shared/table/table';

/** Carga masiva de productos: validar (sin escribir) y luego importar. */
@Component({
  selector: 'app-product-import',
  imports: [ButtonComponent, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header title="Importar productos" description="Carga o actualiza muchos productos a la vez desde Excel." />

    <section class="card p-4 flex flex-col gap-3 max-w-3xl">
      <ol class="list-decimal list-inside text-sm text-muted flex flex-col gap-1">
        <li><strong>Descarga la plantilla de Excel</strong> y ábrela. La hoja "Instrucciones" explica cada columna.</li>
        <li>Escribe un producto por fila. Unidad, impuesto y "controla inventario" se eligen de una lista.</li>
        <li><strong>Guárdala</strong> (sigue siendo Excel) y súbela aquí con "Elegir archivo".</li>
        <li>Toca <strong>Revisar</strong>: te mostramos qué filas tienen errores antes de guardar nada.</li>
        <li>Si todo está bien, toca <strong>Importar</strong>. Si un SKU ya existe, ese producto se actualiza.</li>
      </ol>
      <!-- Decisión 381: precio mayorista (u otra lista) desde el mismo archivo. -->
      <p class="text-sm text-muted"><strong>Precio mayorista:</strong> agrega una columna <code>precio_mayorista</code>
        (o <code>precio_</code> y el código de otra lista de precios). Si la lista no existe, se crea. Una celda vacía no
        cambia ese precio. La plantilla ya trae una columna por cada lista que tengas.</p>
      <!-- Decisión 382: los productos que ya tienes, en el mismo formato, para corregirlos y volver a subirlos. -->
      <p class="text-sm text-muted"><strong>¿Ya tienes productos?</strong> "Descargar mis productos" te da un Excel con
        todos, sus precios (también el mayorista) y la existencia de cada sede. Corrige lo que necesites y súbelo aquí.
        La existencia es solo para consultar: subir el archivo no cambia el inventario.</p>
      <div class="flex flex-wrap gap-2 items-center">
        <app-button label="Descargar plantilla de Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true"
                  [loading]="downloading()" (clicked)="downloadTemplate()" />
        <app-button label="Descargar mis productos" icon="pi pi-download" severity="secondary" [outlined]="true"
                  [loading]="exporting()" (clicked)="downloadProducts()" />
        <label class="inline-flex items-center gap-2 border rounded px-3 py-2 text-sm cursor-pointer hover:bg-surface-alt
                      focus-within:ring-2 focus-within:ring-brand">
          <i class="pi pi-upload text-xs" aria-hidden="true"></i>
          {{ file() ? 'Elegir otro archivo' : 'Elegir archivo' }}
          <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                 (change)="pick($event)" class="sr-only" />
        </label>
        @if (file(); as f) {
          <span class="text-sm text-muted">{{ f.name }}</span>
        }
      </div>
      <div class="flex gap-2">
        <app-button label="Revisar" [disabled]="!file()" [loading]="busy()" (clicked)="run(true)" />
        @if (report(); as r) {
          @if (!r.applied && r.errors.length === 0) {
            <app-button [label]="'Importar ' + (r.toCreate + r.toUpdate) + ' productos'" severity="success"
                      [loading]="busy()" (clicked)="run(false)" />
          }
        }
      </div>
    </section>

    @if (report(); as r) {
      <section class="card p-4 mt-4 max-w-3xl">
        <h2 class="font-bold tracking-tight mb-2">{{ r.applied ? 'Importación completada' : 'Resultado de la validación' }}</h2>
        <p class="text-sm text-muted">
          {{ r.totalRows }} filas · {{ r.toCreate }} nuevos · {{ r.toUpdate }} actualizados
          @if (r.newCategories.length > 0) {
            · categorías nuevas: {{ r.newCategories.join(', ') }}
          }
          @if (r.newPriceLists?.length) {
            · listas de precios nuevas: {{ r.newPriceLists!.join(', ') }}
          }
        </p>
        @if (r.errors.length > 0) {
          <div class="mt-3">
            <app-data-table [columns]="errorColumns" [items]="r.errors" [trackBy]="errorKey" [pageSizeOptions]="[]"
                            caption="Filas con errores" />
          </div>
        }
      </section>
    }
  `,
})
export class ProductImportComponent {
  private readonly api = inject(CatalogApi);
  private readonly messages = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly file = signal<File | null>(null);
  protected readonly report = signal<ImportReport | null>(null);
  protected readonly busy = signal(false);
  protected readonly downloading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly errorKey = (e: ImportRowError): string => `${e.row}:${e.message}`;
  protected readonly errorColumns: ColumnDef<ImportRowError>[] = [
    { header: 'Fila', cell: (e) => e.row, kind: 'mono', cellClass: 'w-20' },
    { header: 'Error', cell: (e) => e.message, cellClass: 'text-danger' },
  ];

  pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.item(0) ?? null;
    // Se limpia el campo para que volver a elegir el mismo archivo (ya corregido) sí dispare el cambio (QA UI-12).
    input.value = '';
    if (!chosen) {
      return;
    }
    this.file.set(chosen);
    this.report.set(null);
  }

  run(dryRun: boolean): void {
    const file = this.file();
    if (!file) {
      return;
    }
    this.busy.set(true);
    this.api.importProducts(file, dryRun).subscribe({
      next: (report) => {
        this.busy.set(false);
        this.report.set(report);
        if (report.applied) {
          this.messages.add({ severity: 'success', summary: 'Productos importados',
            detail: `${report.toCreate} nuevos, ${report.toUpdate} actualizados.` });
          setTimeout(() => void this.router.navigate(['/app/productos']), 1500);
        }
      },
      error: () => this.busy.set(false),
    });
  }

  downloadTemplate(): void {
    this.downloading.set(true);
    this.api.importTemplate().subscribe({
      next: (response) => {
        this.downloading.set(false);
        saveDownload(response, 'plantilla-productos.xlsx');
      },
      error: () => this.downloading.set(false),
    });
  }

  downloadProducts(): void {
    this.exporting.set(true);
    this.api.exportProducts().subscribe({
      next: (response) => {
        this.exporting.set(false);
        saveDownload(response, 'productos.xlsx');
      },
      error: () => this.exporting.set(false),
    });
  }
}
