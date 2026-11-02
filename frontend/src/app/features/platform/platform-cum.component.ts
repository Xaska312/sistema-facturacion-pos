import { Component, OnInit, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { firstValueFrom } from 'rxjs';
import { CumStatus, PlatformApi } from '../../core/api/platform.api';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { CumParseResult, batches, parseCumCsv } from './cum-csv';

/** Tamaño de cada tanda (el servidor admite hasta 2.000). */
const BATCH = 1500;

/**
 * Catálogo CUM del INVIMA (Fase 13-1, decisión 279): el administrador descarga de datos.gov.co el CSV "CÓDIGO ÚNICO DE
 * MEDICAMENTOS VIGENTES" (~75 MB) y lo carga aquí. El navegador lo lee y envía las presentaciones activas en tandas; si
 * una tanda falla, el catálogo anterior queda como estaba. Todas las droguerías lo consultan al crear un producto.
 */
@Component({
  selector: 'app-platform-cum',
  imports: [ButtonModule, PageHeaderComponent, XIconComponent],
  template: `
    <app-page-header title="Catálogo CUM"
                     description="Código Único de Medicamentos del INVIMA. Las droguerías lo usan para llenar la ficha de cada medicamento." />

    <div class="grid gap-4 md:grid-cols-2 max-w-4xl">
      <section class="card p-5 flex flex-col gap-2" aria-labelledby="cum-now">
        <app-xicon name="type-pharmacy" [size]="32" />
        <h2 id="cum-now" class="text-sm text-muted">Presentaciones en el catálogo</h2>
        @if (status(); as s) {
          <p class="text-3xl font-extrabold tracking-tight tabular-nums">{{ s.total.toLocaleString('es-CO') }}</p>
          @if (s.lastImport; as last) {
            <p class="text-sm text-muted">
              Última carga: {{ when(last.finishedAt) }}{{ last.sourceName ? ' · ' + last.sourceName : '' }}
              · {{ (last.removed ?? 0).toLocaleString('es-CO') }} quitadas
            </p>
          } @else {
            <p class="text-sm text-muted">Aún no se ha cargado.</p>
          }
        } @else {
          <p class="text-sm text-muted">Cargando…</p>
        }
      </section>

      <section class="card p-5 flex flex-col gap-3" aria-labelledby="cum-load">
        <h2 id="cum-load" class="font-bold tracking-tight">Cargar o actualizar</h2>
        <ol class="text-sm list-decimal pl-5 flex flex-col gap-1">
          <li>En <span class="font-semibold">datos.gov.co</span> abre "CÓDIGO ÚNICO DE MEDICAMENTOS VIGENTES".</li>
          <li>Toca <span class="font-semibold">Exportar → CSV</span> y guarda el archivo.</li>
          <li>Elígelo aquí. Se reemplaza el catálogo; las fichas de las droguerías no cambian.</li>
        </ol>
        <input #file type="file" accept=".csv,text/csv" class="sr-only" tabindex="-1" aria-hidden="true"
               (change)="load(file)" />
        <p-button class="self-start" label="Elegir el CSV" icon="pi pi-upload" [loading]="busy()"
                  (onClick)="file.click()" />
        @if (step(); as st) {
          <p class="text-sm" role="status">{{ st }}</p>
        }
        @if (progress(); as pct) {
          <div class="h-2 rounded-full bg-line overflow-hidden" role="progressbar" aria-label="Avance de la carga"
               [attr.aria-valuenow]="pct" aria-valuemin="0" aria-valuemax="100">
            <div class="h-2 bg-brand transition-all" [style.width.%]="pct"></div>
          </div>
        }
        @if (summary(); as r) {
          <p class="text-xs text-muted">
            {{ r.lines.toLocaleString('es-CO') }} filas leídas · {{ r.rows.length.toLocaleString('es-CO') }} presentaciones
            activas · {{ r.inactive.toLocaleString('es-CO') }} inactivas y {{ r.samples.toLocaleString('es-CO') }} muestras
            médicas fuera{{ r.invalid ? ' · ' + r.invalid + ' filas sin CUM válido' : '' }}.
          </p>
        }
        @if (error(); as e) {
          <p class="text-sm text-danger" role="alert">{{ e }}</p>
        }
      </section>
    </div>
  `,
})
export class PlatformCumComponent implements OnInit {
  private readonly api = inject(PlatformApi);
  private readonly messages = inject(MessageService);

  protected readonly status = signal<CumStatus | null>(null);
  protected readonly busy = signal(false);
  protected readonly step = signal<string | null>(null);
  protected readonly progress = signal<number | null>(null);
  protected readonly summary = signal<CumParseResult | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  private refresh(): void {
    this.api.cumStatus().subscribe((s) => this.status.set(s));
  }

  protected when(iso: string | null): string {
    return iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  }

  protected async load(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.summary.set(null);
    this.progress.set(null);
    try {
      this.step.set(`Leyendo ${file.name}…`);
      // Deja pintar el mensaje antes de la lectura (unos segundos con el archivo completo).
      await new Promise((resolve) => setTimeout(resolve, 30));
      const parsed = parseCumCsv(await file.text());
      this.summary.set(parsed);
      if (parsed.rows.length === 0) {
        throw new Error('El archivo no trae presentaciones activas.');
      }
      const { id } = await firstValueFrom(this.api.startCumImport(file.name));
      const parts = batches(parsed.rows, BATCH);
      for (let i = 0; i < parts.length; i++) {
        this.step.set(`Enviando tanda ${i + 1} de ${parts.length}…`);
        this.progress.set(Math.round((i / parts.length) * 100));
        await firstValueFrom(this.api.addCumRows(id, parts[i]));
      }
      this.progress.set(100);
      this.step.set('Terminando…');
      const done = await firstValueFrom(this.api.finishCumImport(id, parsed.rows.length));
      this.step.set(`Listo: ${(done.total ?? 0).toLocaleString('es-CO')} presentaciones en el catálogo.`);
      this.messages.add({ severity: 'success', summary: 'Catálogo CUM actualizado', life: 4000 });
      this.refresh();
    } catch (e) {
      const detail = (e as { error?: { detail?: string } })?.error?.detail ?? (e as Error)?.message;
      this.error.set(`${detail ?? 'No se pudo cargar.'} El catálogo anterior sigue igual.`);
      this.step.set(null);
      this.progress.set(null);
    } finally {
      this.busy.set(false);
    }
  }
}
