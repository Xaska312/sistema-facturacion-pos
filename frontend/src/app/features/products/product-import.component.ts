import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ImportReport, ImportRowError } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { saveDownload } from '../../shared/download';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef } from '../../shared/table/table';

/** Carga masiva de productos: validar (sin escribir) y luego importar. */
@Component({
  selector: 'app-product-import',
  imports: [ButtonModule, PageHeaderComponent, DataTableComponent],
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
      <div class="flex flex-wrap gap-2 items-center">
        <p-button label="Descargar plantilla de Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true"
                  [loading]="downloading()" (onClick)="downloadTemplate()" />
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
        <p-button label="Revisar" [disabled]="!file()" [loading]="busy()" (onClick)="run(true)" />
        @if (report(); as r) {
          @if (!r.applied && r.errors.length === 0) {
            <p-button [label]="'Importar ' + (r.toCreate + r.toUpdate) + ' productos'" severity="success"
                      [loading]="busy()" (onClick)="run(false)" />
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
  private readonly messages = inject(MessageService);
  private readonly router = inject(Router);

  protected readonly file = signal<File | null>(null);
  protected readonly report = signal<ImportReport | null>(null);
  protected readonly busy = signal(false);
  protected readonly downloading = signal(false);
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
}
