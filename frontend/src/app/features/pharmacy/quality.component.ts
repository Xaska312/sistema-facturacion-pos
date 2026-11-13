import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonComponent } from '../../shared/ui/button.component';
import { ButtonLinkComponent } from '../../shared/ui/button-link.component';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { Observable, concatMap, from, last } from 'rxjs';
import {
  AdverseEvent,
  PharmacyApi,
  QualityPoint,
  QualityReading,
  QualityShift,
  QualityToday,
} from '../../core/api/pharmacy.api';
import { problemMessage } from '../../core/errors/problem';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { formatDateTime } from '../../shared/format';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { formatDay } from '../orders/order-text';
import { businessToday, isoDate } from '../reports/periods';
import {
  DEFAULT_POINTS,
  SheetRow,
  monthRange,
  outOfRange,
  rangeLabel,
  readingText,
  sheet,
  shiftLabel,
} from './quality-text';

type Tab = 'today' | 'sheet' | 'events' | 'points';

interface Draft {
  shift: QualityShift;
  temperature: number | null;
  humidity: number | null;
  action: string;
  saving: boolean;
}

/**
 * Temperatura y calidad (Fase 13-6, decisión 287): las lecturas de mañana y tarde del local y la nevera, la planilla
 * del mes, los eventos adversos y los puntos de control. El informe para la visita está en su propia pantalla.
 */
@Component({
  selector: 'app-quality',
  imports: [FormsModule, RouterLink, ButtonComponent, ButtonLinkComponent, AppInputDirective, SkeletonComponent, PageHeaderComponent,
    EmptyStateComponent, FormDialogComponent],
  template: `
    <app-page-header title="Temperatura y calidad"
                     description="Lecturas del termohigrómetro y de la nevera, eventos adversos e informe para la visita de la Secretaría de Salud.">
      <a appButton routerLink="/app/farmacia/informe" label="Informe para la visita" icon="pi pi-file"
         severity="secondary" [outlined]="true"></a>
    </app-page-header>

    <div class="flex flex-wrap items-center gap-2 mb-4">
      <div class="flex flex-wrap gap-1" role="tablist" aria-label="Secciones">
        @for (t of tabs; track t.code) {
          <button type="button" role="tab" class="chip" [attr.aria-selected]="tab() === t.code" (click)="go(t.code)">{{ t.label }}</button>
        }
      </div>
      @if ((today()?.branches?.length ?? 0) > 1) {
        <select class="border rounded-[10px] px-3 min-h-11 ml-auto" aria-label="Sucursal" [ngModel]="branchId()"
                (ngModelChange)="changeBranch($event)">
          @for (b of today()!.branches; track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      }
    </div>

    @switch (tab()) {
      @case ('today') {
        @if (today(); as t) {
          @if (t.points.length === 0) {
            <app-empty-state icon="pi pi-sun" title="Crea tus puntos de control"
                             message="El local (con su termohigrómetro) y la nevera de cadena de frío. Los rangos se pueden cambiar después."
                             actionLabel="Crear local y nevera" (action)="createDefaults()" />
          } @else {
            @if (t.missing.length > 0) {
              <p class="missing mb-4" role="status"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
                Falta registrar: {{ t.missing.join(', ') }}.</p>
            }
            <div class="grid gap-4 md:grid-cols-2">
              @for (pt of t.points; track pt.point.id) {
                @let p = pt.point;
                @let d = draft(p.id);
                <section class="card p-4 flex flex-col gap-3" [attr.aria-labelledby]="'p-' + p.id">
                  <header>
                    <h2 [id]="'p-' + p.id" class="text-base font-bold">{{ p.name }}
                      <span class="text-xs font-normal text-muted">· {{ p.kind === 'FRIDGE' ? 'Nevera' : 'Local' }}</span></h2>
                    <p class="text-xs text-muted">Rango: {{ range(p) }}</p>
                  </header>
                  <ul class="flex flex-col gap-1 text-sm">
                    @for (s of shifts; track s) {
                      @let r = s === 'MORNING' ? pt.morning : pt.afternoon;
                      <li class="flex flex-wrap items-baseline gap-2">
                        <span class="w-16 font-semibold">{{ shiftName(s) }}</span>
                        @if (r) {
                          <span [class.text-danger]="r.outOfRange" class="font-semibold tabular-nums">{{ text(r) }}</span>
                          <span class="text-xs text-muted">{{ r.recordedByName }} · {{ when(r.recordedAt) }}</span>
                          @if (r.actionTaken) {
                            <span class="block w-full text-xs">Qué se hizo: {{ r.actionTaken }}</span>
                          }
                        } @else {
                          <span class="text-xs text-muted">Sin registrar</span>
                        }
                      </li>
                    }
                  </ul>
                  @if (pending(pt).length > 0) {
                    <form class="flex flex-col gap-2 border-t pt-3" (ngSubmit)="save(p)">
                      <div class="flex flex-wrap gap-3 items-end">
                        <label class="flex flex-col gap-1 text-xs font-medium">Turno
                          <select class="border rounded-[10px] px-2 min-h-11" [name]="'shift-' + p.id" [(ngModel)]="d.shift">
                            @for (s of pending(pt); track s) {
                              <option [value]="s">{{ shiftName(s) }}</option>
                            }
                          </select>
                        </label>
                        <label class="flex flex-col gap-1 text-xs font-medium">Temperatura (°C)
                          <input appInput type="number" step="0.1" inputmode="decimal" class="w-28" [name]="'t-' + p.id"
                                 [(ngModel)]="d.temperature" required />
                        </label>
                        @if (p.kind === 'ROOM') {
                          <label class="flex flex-col gap-1 text-xs font-medium">Humedad (%)
                            <input appInput type="number" step="1" inputmode="decimal" class="w-24" [name]="'h-' + p.id"
                                   [(ngModel)]="d.humidity" required />
                          </label>
                        }
                      </div>
                      @if (out(p, d)) {
                        <label class="flex flex-col gap-1 text-xs font-medium text-danger">Está fuera del rango: ¿qué se hizo?
                          <textarea class="border rounded-[10px] p-2 text-sm" rows="2" maxlength="300" [name]="'a-' + p.id"
                                    [(ngModel)]="d.action" placeholder="Se prendió el aire, se revisó la puerta de la nevera…"></textarea>
                        </label>
                      }
                      <div class="flex justify-end">
                        <app-button type="submit" label="Guardar lectura" icon="pi pi-check" [loading]="d.saving"
                                  [disabled]="!canSave(p, d)" />
                      </div>
                    </form>
                  } @else if (!t.afternoonOpen && pt.morning) {
                    <p class="text-xs text-muted border-t pt-3">La lectura de la tarde se registra desde las 12 del día.</p>
                  }
                </section>
              }
            </div>
            <p class="text-xs text-muted mt-4">Las lecturas no se cambian ni se borran. Si anotaste mal, acláralo en la
              lectura siguiente (en "qué se hizo").</p>
          }
        } @else {
          <app-skeleton height="14rem" borderRadius="1.25rem" />
        }
      }

      @case ('sheet') {
        <div class="flex flex-wrap items-center gap-3 mb-3">
          <label class="flex items-center gap-2 text-sm">Mes
            <input type="month" class="border rounded-[10px] px-2 min-h-11" [max]="thisMonth" [(ngModel)]="month"
                   (ngModelChange)="loadSheet()" />
          </label>
        </div>
        @if (sheetRows(); as rows) {
          <div class="card overflow-x-auto">
            <table class="w-full text-sm whitespace-nowrap">
              <caption class="sr-only">Planilla de temperatura y humedad</caption>
              <thead>
                <tr class="border-b text-left">
                  <th class="p-2" rowspan="2">Día</th>
                  @for (p of sheetPoints(); track p.id) {
                    <th class="p-2 text-center" colspan="2">{{ p.name }}</th>
                  }
                </tr>
                <tr class="border-b text-xs text-muted">
                  @for (p of sheetPoints(); track p.id) {
                    <th class="px-2 pb-1 text-left font-medium">Mañana</th>
                    <th class="px-2 pb-1 text-left font-medium">Tarde</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of rows; track row.date) {
                  <tr class="border-b">
                    <td class="p-2">{{ day(row.date) }}</td>
                    @for (p of sheetPoints(); track p.id) {
                      @for (c of row.cells[p.id]; track $index) {
                        <td class="p-2 tabular-nums" [class.text-danger]="c?.outOfRange" [attr.title]="c?.actionTaken">
                          {{ c ? text(c) : '—' }}
                        </td>
                      }
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (sheetOut().length > 0) {
            <section class="card p-4 mt-4">
              <h2 class="font-bold mb-2">Fuera de rango y qué se hizo</h2>
              <ul class="text-sm flex flex-col gap-1">
                @for (r of sheetOut(); track r.id) {
                  <li><strong>{{ day(r.date) }} · {{ shiftName(r.shift) }} · {{ r.pointName }}:</strong> {{ text(r) }} —
                    {{ r.actionTaken }}</li>
                }
              </ul>
            </section>
          }
        } @else {
          <app-skeleton height="14rem" borderRadius="1.25rem" />
        }
      }

      @case ('events') {
        <div class="flex flex-wrap items-center gap-3 mb-3">
          <p class="text-sm text-muted flex-1">Cuando un medicamento le hace daño a un paciente. Anótalo aquí y
            repórtalo en la página del INVIMA (formato FOREAM); después anota la fecha y el número del reporte.</p>
          <app-button label="Registrar evento" icon="pi pi-plus" (clicked)="openEvent()" />
        </div>
        @if (events(); as list) {
          @if (list.length === 0) {
            <app-empty-state icon="pi pi-heart" title="Sin eventos adversos"
                             message="Ojalá siga así. Si un paciente presenta una reacción a un medicamento, regístrala aquí." />
          }
          <div class="flex flex-col gap-3">
            @for (e of list; track e.id) {
              <article class="card p-4 text-sm flex flex-col gap-1">
                <div class="flex flex-wrap items-baseline gap-2">
                  <span class="font-bold">N.º {{ e.number }} · {{ e.productName }}</span>
                  @if (e.lotNumber) { <span class="text-muted">lote {{ e.lotNumber }}</span> }
                  @if (e.serious) { <span class="tag-serious">Grave</span> }
                  <span class="ml-auto text-xs text-muted">{{ day(e.occurredOn) }}</span>
                </div>
                <p>{{ e.patientName }}{{ e.patientAge !== null ? ', ' + e.patientAge + ' años' : '' }}{{ e.patientDocument ? ' · ' + e.patientDocument : '' }}</p>
                <p class="text-muted">{{ e.description }}</p>
                <div class="flex flex-wrap items-center gap-2 mt-1">
                  @if (e.reportedOn) {
                    <span class="text-xs"><i class="pi pi-check-circle text-success" aria-hidden="true"></i>
                      Reportado al INVIMA el {{ day(e.reportedOn) }}{{ e.invimaReference ? ' · ' + e.invimaReference : '' }}</span>
                  } @else {
                    <span class="text-xs text-danger">Falta reportarlo al INVIMA</span>
                  }
                  <app-button [label]="e.reportedOn ? 'Corregir reporte' : 'Anotar reporte'" size="small" [text]="true"
                            (clicked)="openReport(e)" />
                </div>
              </article>
            }
          </div>
        } @else {
          <app-skeleton height="10rem" borderRadius="1.25rem" />
        }
      }

      @case ('points') {
        <div class="flex justify-end mb-3">
          <app-button label="Nuevo punto" icon="pi pi-plus" (clicked)="openPoint(null)" />
        </div>
        @if (points(); as list) {
          <div class="grid gap-3 md:grid-cols-2">
            @for (p of list; track p.id) {
              <button type="button" class="card p-4 text-left" [class.opacity-60]="!p.active" (click)="openPoint(p)">
                <span class="block font-bold">{{ p.name }}{{ p.active ? '' : ' · Inactivo' }}</span>
                <span class="block text-xs text-muted">{{ p.kind === 'FRIDGE' ? 'Nevera' : 'Local' }} · {{ range(p) }}</span>
              </button>
            }
          </div>
        }
      }
    }

    <app-form-dialog [(visible)]="pointOpen" [header]="editingPoint() ? 'Editar ' + editingPoint()!.name : 'Nuevo punto de control'"
                     width="28rem" [dirty]="true" [invalidMessage]="pointProblem()" [save]="pointRequest"
                     successMessage="Punto guardado" (saved)="reload()">
      <label class="flex flex-col gap-1 text-sm font-semibold">Nombre
        <input appInput maxlength="60" placeholder="Local, Nevera, Bodega" [(ngModel)]="pName" />
      </label>
      @if (!editingPoint()) {
        <label class="flex flex-col gap-1 text-sm font-semibold">Qué es
          <select class="border rounded-[10px] px-3 min-h-11" [(ngModel)]="pKind">
            <option value="ROOM">Local o bodega (temperatura y humedad)</option>
            <option value="FRIDGE">Nevera (solo temperatura)</option>
          </select>
        </label>
      }
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1 text-sm font-semibold">Temperatura mínima (°C)
          <input appInput type="number" step="0.1" [(ngModel)]="pTempMin" />
        </label>
        <label class="flex flex-col gap-1 text-sm font-semibold">Temperatura máxima (°C)
          <input appInput type="number" step="0.1" [(ngModel)]="pTempMax" />
        </label>
        @if ((editingPoint()?.kind ?? pKind) === 'ROOM') {
          <label class="flex flex-col gap-1 text-sm font-semibold">Humedad mínima (%)
            <input appInput type="number" step="1" [(ngModel)]="pHumMin" />
          </label>
          <label class="flex flex-col gap-1 text-sm font-semibold">Humedad máxima (%)
            <input appInput type="number" step="1" [(ngModel)]="pHumMax" />
          </label>
        }
      </div>
      @if (editingPoint()) {
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="size-4" [(ngModel)]="pActive" />Activo (se le piden lecturas)
        </label>
      }
    </app-form-dialog>

    <app-form-dialog [(visible)]="eventOpen" header="Registrar evento adverso" width="34rem" [dirty]="true"
                     [invalidMessage]="eventProblem()" [save]="eventRequest" successMessage="Evento registrado"
                     (saved)="loadEvents()"
                     description="Los datos del paciente son de salud: solo los ven quienes tienen este permiso.">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-sm font-semibold">Fecha en que pasó
          <input appInput type="date" [max]="todayIso" [(ngModel)]="eOccurred" />
        </label>
        <label class="flex flex-col gap-1 text-sm font-semibold">Medicamento
          <input appInput maxlength="200" placeholder="Amoxicilina 500 mg" [(ngModel)]="eProduct" />
        </label>
        <label class="flex flex-col gap-1 text-sm font-semibold">Paciente
          <input appInput maxlength="160" [(ngModel)]="ePatient" />
        </label>
        <label class="flex flex-col gap-1 text-sm font-semibold">Documento <span class="font-normal text-muted">(opcional)</span>
          <input appInput maxlength="20" [(ngModel)]="eDocument" />
        </label>
        <label class="flex flex-col gap-1 text-sm font-semibold">Edad <span class="font-normal text-muted">(opcional)</span>
          <input appInput type="number" min="0" max="130" [(ngModel)]="eAge" />
        </label>
        <label class="flex flex-col gap-1 text-sm font-semibold">Lote <span class="font-normal text-muted">(opcional)</span>
          <input appInput maxlength="40" [(ngModel)]="eLot" />
        </label>
      </div>
      <label class="flex flex-col gap-1 text-sm font-semibold">Qué le pasó
        <textarea class="border rounded-[10px] p-2 text-sm font-normal" rows="3" maxlength="1000" [(ngModel)]="eDescription"></textarea>
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" class="size-4" [(ngModel)]="eSerious" />Es grave (hospitalización, riesgo de muerte, discapacidad)
      </label>
    </app-form-dialog>

    <app-form-dialog [(visible)]="reportOpen" header="Reporte al INVIMA" width="26rem" [dirty]="true"
                     [invalidMessage]="rDate ? null : 'Escribe la fecha del reporte.'" [save]="reportRequest"
                     successMessage="Reporte anotado" (saved)="loadEvents()"
                     description="Cuando ya lo reportaste en la página del INVIMA (FOREAM), anota la fecha y el número que te dieron.">
      <label class="flex flex-col gap-1 text-sm font-semibold">Fecha del reporte
        <input appInput type="date" [max]="todayIso" [(ngModel)]="rDate" />
      </label>
      <label class="flex flex-col gap-1 text-sm font-semibold">Número del reporte <span class="font-normal text-muted">(opcional)</span>
        <input appInput maxlength="60" [(ngModel)]="rReference" />
      </label>
    </app-form-dialog>
  `,
  styles: `
    .chip { min-height: 2.75rem; padding: 0 1rem; border-radius: 9999px; border: 1px solid var(--surface-border);
      background: var(--surface); font-size: 0.875rem; font-weight: 600; }
    .chip[aria-selected='true'] { background: var(--brand); border-color: var(--brand); color: var(--brand-contrast); }
    .missing { display: flex; gap: 0.5rem; align-items: center; padding: 0.75rem 1rem; border-radius: 1rem;
      background: var(--warning-soft); color: var(--warning-soft-text); font-size: 0.875rem; font-weight: 600; }
    .tag-serious { padding: 0 0.5rem; border-radius: 9999px; background: var(--danger-soft); color: var(--danger-soft-text);
      font-size: 0.75rem; font-weight: 700; }
  `,
})
export class QualityComponent implements OnInit {
  private readonly api = inject(PharmacyApi);
  private readonly messages = inject(MessageService);

  protected readonly tabs: readonly { code: Tab; label: string }[] = [
    { code: 'today', label: 'Hoy' }, { code: 'sheet', label: 'Planilla del mes' },
    { code: 'events', label: 'Eventos adversos' }, { code: 'points', label: 'Puntos de control' },
  ];
  protected readonly shifts: readonly QualityShift[] = ['MORNING', 'AFTERNOON'];
  protected readonly tab = signal<Tab>('today');
  protected readonly branchId = signal<string | null>(null);
  protected readonly today = signal<QualityToday | null>(null);
  protected readonly points = signal<QualityPoint[] | null>(null);
  protected readonly events = signal<AdverseEvent[] | null>(null);
  protected readonly sheetRows = signal<SheetRow[] | null>(null);
  protected readonly sheetPoints = signal<QualityPoint[]>([]);
  protected readonly sheetOut = signal<QualityReading[]>([]);
  private readonly drafts = new Map<string, Draft>();

  protected readonly todayIso = isoDate(businessToday());
  protected readonly thisMonth = this.todayIso.slice(0, 7);
  protected month = this.thisMonth;

  protected readonly range = rangeLabel;
  protected readonly text = readingText;
  protected readonly shiftName = shiftLabel;
  protected readonly when = formatDateTime;
  protected readonly day = formatDay;

  ngOnInit(): void {
    this.reload();
  }

  protected go(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'sheet') {
      this.loadSheet();
    } else if (tab === 'events') {
      this.loadEvents();
    } else if (tab === 'points') {
      this.loadPoints();
    }
  }

  reload(): void {
    this.api.qualityToday(this.branchId()).subscribe({
      next: (t) => {
        this.branchId.set(t.branchId);
        this.drafts.clear();
        this.today.set(t);
      },
      error: () => this.today.set(null),
    });
    if (this.tab() === 'points') {
      this.loadPoints();
    }
  }

  protected changeBranch(id: string): void {
    this.branchId.set(id);
    this.today.set(null);
    this.reload();
    this.go(this.tab());
  }

  // ------------------------------------------------------------ hoy

  protected pending(pt: QualityToday['points'][number]): QualityShift[] {
    const t = this.today();
    const list: QualityShift[] = [];
    if (!pt.morning) {
      list.push('MORNING');
    }
    if (!pt.afternoon && t?.afternoonOpen) {
      list.push('AFTERNOON');
    }
    return list;
  }

  protected draft(pointId: string): Draft {
    let d = this.drafts.get(pointId);
    if (!d) {
      const pt = this.today()?.points.find((x) => x.point.id === pointId);
      const pending = pt ? this.pending(pt) : [];
      const shift = this.today()?.shift === 'AFTERNOON' && pending.includes('AFTERNOON') ? 'AFTERNOON' : (pending[0] ?? 'MORNING');
      d = { shift, temperature: null, humidity: null, action: '', saving: false };
      this.drafts.set(pointId, d);
    }
    return d;
  }

  protected out(p: QualityPoint, d: Draft): boolean {
    return outOfRange(p, d.temperature === null ? null : Number(d.temperature), d.humidity === null ? null : Number(d.humidity));
  }

  protected canSave(p: QualityPoint, d: Draft): boolean {
    const hasTemp = d.temperature !== null && String(d.temperature) !== '';
    const hasHum = p.kind === 'FRIDGE' || (d.humidity !== null && String(d.humidity) !== '');
    return hasTemp && hasHum && (!this.out(p, d) || d.action.trim().length > 0) && !d.saving;
  }

  protected save(p: QualityPoint): void {
    const d = this.draft(p.id);
    if (!this.canSave(p, d)) {
      return;
    }
    d.saving = true;
    this.api.recordReading({ pointId: p.id, shift: d.shift, temperature: Number(d.temperature),
      humidity: p.kind === 'ROOM' ? Number(d.humidity) : null, actionTaken: d.action.trim() || null }).subscribe({
      next: (r) => {
        this.messages.add({ severity: r.outOfRange ? 'warn' : 'success', summary: 'Lectura guardada',
          detail: `${p.name} · ${shiftLabel(r.shift)}: ${readingText(r)}`, life: 3000 });
        this.reload();
      },
      error: () => (d.saving = false),
    });
  }

  protected createDefaults(): void {
    from(DEFAULT_POINTS).pipe(concatMap((p) => this.api.createQualityPoint(this.branchId(), p)), last()).subscribe({
      next: () => {
        this.messages.add({ severity: 'success', summary: 'Listo: local y nevera', life: 2500 });
        this.reload();
      },
      error: (e: unknown) => this.messages.add({ severity: 'error', summary: 'No se crearon', detail: problemMessage(e) }),
    });
  }

  // ------------------------------------------------------------ planilla

  loadSheet(): void {
    const { from: f, to: t } = monthRange(this.month || this.thisMonth);
    const to = t > this.todayIso ? this.todayIso : t;
    this.sheetRows.set(null);
    this.api.qualityPoints(this.branchId()).subscribe((points) => {
      this.api.readings(this.branchId(), f, to).subscribe((readings) => {
        const used = new Set(readings.map((r) => r.pointId));
        const shown = points.filter((p) => p.active || used.has(p.id));
        this.sheetPoints.set(shown);
        this.sheetRows.set(f > to ? [] : sheet(readings, shown.map((p) => p.id), f, to));
        this.sheetOut.set(readings.filter((r) => r.outOfRange));
      });
    });
  }

  // ------------------------------------------------------------ eventos adversos

  protected eventOpen = false;
  protected eOccurred = '';
  protected eProduct = '';
  protected ePatient = '';
  protected eDocument = '';
  protected eAge: number | null = null;
  protected eLot = '';
  protected eDescription = '';
  protected eSerious = false;

  loadEvents(): void {
    this.api.adverseEvents(this.branchId(), null, null).subscribe((list) => this.events.set(list));
  }

  protected openEvent(): void {
    this.eOccurred = this.todayIso;
    this.eProduct = '';
    this.ePatient = '';
    this.eDocument = '';
    this.eAge = null;
    this.eLot = '';
    this.eDescription = '';
    this.eSerious = false;
    this.eventOpen = true;
  }

  protected eventProblem(): string | null {
    if (!this.eOccurred) {
      return 'Escribe la fecha en que pasó.';
    }
    if (!this.eProduct.trim()) {
      return 'Escribe el medicamento.';
    }
    if (!this.ePatient.trim()) {
      return 'Escribe el nombre del paciente.';
    }
    return this.eDescription.trim() ? null : 'Describe qué le pasó al paciente.';
  }

  protected readonly eventRequest = (): Observable<AdverseEvent> => this.api.createAdverseEvent({
    branchId: this.branchId(), occurredOn: this.eOccurred, patientName: this.ePatient.trim(),
    patientDocument: this.eDocument.trim() || null, patientAge: this.eAge === null || String(this.eAge) === '' ? null : Number(this.eAge),
    productId: null, productName: this.eProduct.trim(), lotNumber: this.eLot.trim() || null,
    description: this.eDescription.trim(), serious: this.eSerious, reportedOn: null, invimaReference: null,
  });

  protected reportOpen = false;
  protected rDate = '';
  protected rReference = '';
  private reporting: AdverseEvent | null = null;

  protected openReport(e: AdverseEvent): void {
    this.reporting = e;
    this.rDate = e.reportedOn ?? this.todayIso;
    this.rReference = e.invimaReference ?? '';
    this.reportOpen = true;
  }

  protected readonly reportRequest = (): Observable<AdverseEvent> =>
    this.api.reportAdverseEvent(this.reporting?.id ?? '', this.rDate, this.rReference.trim() || null);

  // ------------------------------------------------------------ puntos

  protected pointOpen = false;
  protected readonly editingPoint = signal<QualityPoint | null>(null);
  protected pName = '';
  protected pKind: 'ROOM' | 'FRIDGE' = 'ROOM';
  protected pTempMin: number | null = 15;
  protected pTempMax: number | null = 30;
  protected pHumMin: number | null = 35;
  protected pHumMax: number | null = 70;
  protected pActive = true;

  loadPoints(): void {
    this.api.qualityPoints(this.branchId()).subscribe((list) => this.points.set(list));
  }

  protected openPoint(p: QualityPoint | null): void {
    this.editingPoint.set(p);
    this.pName = p?.name ?? '';
    this.pKind = p?.kind ?? 'ROOM';
    this.pTempMin = p?.tempMin ?? 15;
    this.pTempMax = p?.tempMax ?? 30;
    this.pHumMin = p ? p.humidityMin : 35;
    this.pHumMax = p ? p.humidityMax : 70;
    this.pActive = p?.active ?? true;
    this.pointOpen = true;
  }

  protected pointProblem(): string | null {
    if (!this.pName.trim()) {
      return 'Escribe el nombre del punto.';
    }
    if (this.pTempMin === null || this.pTempMax === null || Number(this.pTempMin) >= Number(this.pTempMax)) {
      return 'La temperatura mínima debe ser menor que la máxima.';
    }
    const kind = this.editingPoint()?.kind ?? this.pKind;
    if (kind === 'ROOM' && (this.pHumMin === null || this.pHumMax === null || Number(this.pHumMin) >= Number(this.pHumMax))) {
      return 'La humedad mínima debe ser menor que la máxima.';
    }
    return null;
  }

  protected readonly pointRequest = (): Observable<QualityPoint> => {
    const editing = this.editingPoint();
    const kind = editing?.kind ?? this.pKind;
    const input = {
      name: this.pName.trim(), kind, tempMin: Number(this.pTempMin), tempMax: Number(this.pTempMax),
      humidityMin: kind === 'ROOM' ? Number(this.pHumMin) : null, humidityMax: kind === 'ROOM' ? Number(this.pHumMax) : null,
      active: this.pActive,
    };
    return editing ? this.api.updateQualityPoint(editing.id, input) : this.api.createQualityPoint(this.branchId(), input);
  };
}
