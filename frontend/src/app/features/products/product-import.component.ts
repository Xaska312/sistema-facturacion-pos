import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ImportReport, ImportRowError } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { importTemplateCsv } from './import-template';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef } from '../../shared/table/table';

/** Carga masiva de productos: validar (sin escribir) y luego importar. */
@Component({
  selector: 'app-product-import',
  imports: [ButtonModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header title="Importar productos" description="Carga o actualiza muchos productos a la vez desde un archivo CSV." />

    <section class="card p-4 flex flex-col gap-3 max-w-3xl">
      <ol class="list-decimal list-inside text-sm text-muted flex flex-col gap-1">
        <li>Descarga la plantilla y llénala en Excel (una fila por producto).</li>
        <li>Guárdala como <strong>CSV UTF-8</strong>. Columnas obligatorias: sku, nombre, impuesto, precio.</li>
        <li>Impuesto: IVA19, IVA5, EXENTO o EXCLUIDO. Unidad: UND, KG, LT… (vacía = UND).</li>
        <li>Si un SKU ya existe, se actualiza. Las categorías nuevas se crean solas.</li>
        <li>Si alguna fila tiene errores, no se importa nada: corrige y vuelve a validar.</li>
      </ol>
      <div class="flex flex-wrap gap-2 items-center">
        <p-button label="Descargar plantilla" severity="secondary" [outlined]="true" (onClick)="downloadTemplate()" />
        <input type="file" accept=".csv,text/csv" (change)="pick($event)" class="text-sm" />
      </div>
      <div class="flex gap-2">
        <p-button label="Validar" [disabled]="!file()" [loading]="busy()" (onClick)="run(true)" />
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
        <h2 class="font-medium mb-2">{{ r.applied ? 'Importación completada' : 'Resultado de la validación' }}</h2>
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
  protected readonly errorKey = (e: ImportRowError): string => `${e.row}:${e.message}`;
  protected readonly errorColumns: ColumnDef<ImportRowError>[] = [
    { header: 'Fila', cell: (e) => e.row, kind: 'mono', cellClass: 'w-20' },
    { header: 'Error', cell: (e) => e.message, cellClass: 'text-danger' },
  ];

  pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.item(0) ?? null);
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
    const blob = new Blob([importTemplateCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-productos.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
}
