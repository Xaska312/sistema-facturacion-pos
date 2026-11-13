import { Component, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonComponent } from '../../shared/ui/button.component';
import { DiningApi, DiningTable, DiningZone, TableShape } from '../../core/api/dining.api';
import { MAX_SIZE, MIN_SIZE, PLAN_H, PLAN_W, PlacedTable, boxStyle, moveBy, placeTables, resize } from './table-map';

type Spot = PlacedTable<DiningTable>;

/**
 * Editor del plano de una zona (decisión 284): arrastra cada mesa a su lugar (con el dedo o el mouse), elige su forma
 * y su tamaño, y guarda. Las flechas del teclado mueven la mesa elegida.
 */
@Component({
  selector: 'app-layout-editor',
  imports: [FormsModule, ButtonComponent],
  template: `
    <div class="flex flex-col gap-3">
      <p class="text-sm text-muted">Arrastra cada mesa a donde está en el local. Tócala para cambiar su forma y tamaño.
        Con el teclado: flechas para moverla.</p>
      <div #plan class="plan" (pointermove)="drag($event)" (pointerup)="drop()" (pointercancel)="drop()"
           (pointerleave)="drop()" role="application" [attr.aria-label]="'Plano de ' + zone().name">
        @for (s of spots(); track s.item.id; let i = $index) {
          <button type="button" class="spot" [class.round]="s.shape === 'ROUND'" [class.selected]="selected() === i"
                  [style]="box(s)" (pointerdown)="grab($event, i)" (keydown)="key($event, i)" (focus)="selected.set(i)"
                  [attr.aria-label]="'Mesa ' + s.item.name + ', ' + Math.round(s.x) + ' a la derecha, ' + Math.round(s.y) + ' abajo'">
            {{ s.item.name }}
          </button>
        }
      </div>

      @if (current(); as c) {
        <div class="flex flex-wrap items-end gap-3 border rounded-xl p-3">
          <span class="font-bold">Mesa {{ c.item.name }}</span>
          <fieldset class="flex gap-1" aria-label="Forma">
            @for (sh of shapes; track sh.code) {
              <button type="button" class="chip" [attr.aria-pressed]="c.shape === sh.code" (click)="setShape(sh.code)">{{ sh.label }}</button>
            }
          </fieldset>
          <label class="flex flex-col gap-1 text-xs font-medium">{{ c.shape === 'RECT' ? 'Ancho' : 'Tamaño' }}
            <input type="range" [min]="min" [max]="max" [ngModel]="c.w" (ngModelChange)="setSize($event, c.h)" />
          </label>
          @if (c.shape === 'RECT') {
            <label class="flex flex-col gap-1 text-xs font-medium">Alto
              <input type="range" [min]="min" [max]="max" [ngModel]="c.h" (ngModelChange)="setSize(c.w, $event)" />
            </label>
          }
        </div>
      }

      <div class="flex flex-wrap justify-end gap-2">
        <app-button label="Acomodar en filas" icon="pi pi-th-large" severity="secondary" [text]="true" (clicked)="arrange()" />
        <app-button label="Cerrar" severity="secondary" [outlined]="true" (clicked)="closed.emit()" />
        <app-button label="Guardar plano" icon="pi pi-check" [loading]="saving()" [disabled]="!dirty()" (clicked)="save()" />
      </div>
    </div>
  `,
  styles: `
    .plan {
      position: relative; width: 100%; aspect-ratio: 100 / 70; touch-action: none; user-select: none;
      border-radius: 1rem; border: 1px solid var(--surface-border); background-color: var(--plan-bg);
      background-image: linear-gradient(var(--plan-grid) 1px, transparent 1px), linear-gradient(90deg, var(--plan-grid) 1px, transparent 1px);
      background-size: 5% 7.142857%; container-type: inline-size;
    }
    .spot {
      position: absolute; display: flex; align-items: center; justify-content: center; cursor: grab;
      border-radius: 0.8em; border: 2px solid var(--brand); background: var(--brand-soft); color: var(--brand-soft-text);
      font-weight: 800; font-size: clamp(10px, 2cqw, 18px); touch-action: none;
    }
    .spot.round { border-radius: 9999px; }
    .spot.selected { outline: 3px solid var(--focus-ring); outline-offset: 2px; z-index: 1; }
    .chip { min-height: 2.5rem; padding: 0 0.875rem; border-radius: 9999px; border: 1px solid var(--surface-border);
      background: var(--surface); font-size: 0.875rem; font-weight: 600; }
    .chip[aria-pressed='true'] { background: var(--brand); border-color: var(--brand); color: var(--brand-contrast); }
  `,
})
export class LayoutEditorComponent implements OnInit {
  readonly zone = input.required<DiningZone>();
  readonly saved = output<DiningZone>();
  readonly closed = output<void>();

  private readonly api = inject(DiningApi);
  private readonly messages = inject(MessageService);
  private readonly planRef = viewChild.required<ElementRef<HTMLElement>>('plan');

  protected readonly Math = Math;
  protected readonly min = MIN_SIZE;
  protected readonly max = MAX_SIZE;
  protected readonly shapes: readonly { code: TableShape; label: string }[] = [
    { code: 'SQUARE', label: 'Cuadrada' }, { code: 'ROUND', label: 'Redonda' }, { code: 'RECT', label: 'Rectangular' },
  ];
  protected readonly box = boxStyle;
  protected readonly spots = signal<Spot[]>([]);
  protected readonly selected = signal<number | null>(null);
  protected readonly current = computed(() => {
    const i = this.selected();
    return i === null ? null : this.spots()[i] ?? null;
  });
  protected readonly saving = signal(false);
  protected readonly dirty = signal(false);
  private dragging: { index: number; startX: number; startY: number; x: number; y: number } | null = null;

  ngOnInit(): void {
    this.spots.set(placeTables(this.zone().tables.filter((t) => t.active), (t) => t.map));
    // Si alguna no tenía lugar, guardarlo también (quedó acomodada).
    this.dirty.set(this.zone().tables.some((t) => t.active && t.map.x === null));
  }

  protected grab(event: PointerEvent, index: number): void {
    this.selected.set(index);
    const s = this.spots()[index];
    this.dragging = { index, startX: event.clientX, startY: event.clientY, x: s.x, y: s.y };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  protected drag(event: PointerEvent): void {
    const d = this.dragging;
    if (!d) {
      return;
    }
    const rect = this.planRef().nativeElement.getBoundingClientRect();
    const dx = ((event.clientX - d.startX) / rect.width) * PLAN_W;
    const dy = ((event.clientY - d.startY) / rect.height) * PLAN_H;
    this.spots.update((list) => list.map((s, i) => (i === d.index ? { ...s, ...moveBy({ ...s, x: d.x, y: d.y }, dx, dy) } : s)));
    this.dirty.set(true);
  }

  protected drop(): void {
    this.dragging = null;
  }

  protected key(event: KeyboardEvent, index: number): void {
    const step = event.shiftKey ? 5 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[event.key];
    if (!m) {
      return;
    }
    event.preventDefault();
    this.spots.update((list) => list.map((s, i) => (i === index ? { ...s, ...moveBy(s, m[0], m[1]) } : s)));
    this.dirty.set(true);
  }

  protected setShape(shape: TableShape): void {
    this.update((s) => resize(s, s.w, shape === 'RECT' ? Math.max(MIN_SIZE, Math.round(s.w * 0.6)) : s.w, shape));
  }

  protected setSize(w: number, h: number): void {
    this.update((s) => resize(s, Number(w), Number(h), s.shape));
  }

  private update(fn: (s: Spot) => Spot): void {
    const i = this.selected();
    if (i === null) {
      return;
    }
    this.spots.update((list) => list.map((s, k) => (k === i ? fn(s) : s)));
    this.dirty.set(true);
  }

  protected arrange(): void {
    this.spots.set(placeTables(this.spots().map((s) => s.item),
      (t) => ({ ...this.spots().find((s) => s.item.id === t.id)!, x: null, y: null })));
    this.dirty.set(true);
  }

  protected save(): void {
    this.saving.set(true);
    this.api.saveLayout(this.zone().id, this.spots().map((s) => ({ tableId: s.item.id, x: s.x, y: s.y, w: s.w, h: s.h,
      shape: s.shape }))).subscribe({
      next: (zone) => {
        this.saving.set(false);
        this.dirty.set(false);
        this.messages.add({ severity: 'success', summary: 'Plano guardado', detail: zone.name, life: 2500 });
        this.saved.emit(zone);
      },
      error: () => this.saving.set(false),
    });
  }
}
