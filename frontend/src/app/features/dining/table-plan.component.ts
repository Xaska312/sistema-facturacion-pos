import { Component, computed, input, output } from '@angular/core';
import { FloorTable } from '../../core/api/dining.api';
import { formatCop } from '../../shared/money';
import { openFor } from './dining-labels';
import { MapState, boxStyle, placeTables, stateLabel } from './table-map';

/**
 * Plano de una zona con sus mesas en su lugar y del color de su estado (decisión 284): libre, pidiendo, en cocina,
 * platos listos, comiendo o pidió la cuenta. Tocar una mesa la abre (libre) o va a su cuenta.
 */
@Component({
  selector: 'app-table-plan',
  template: `
    <div class="plan" role="list" [attr.aria-label]="'Plano de ' + zoneName()">
      @for (p of placed(); track p.item.id) {
        @let t = p.item;
        @let st = state(t);
        <button type="button" role="listitem" class="spot" [class.round]="p.shape === 'ROUND'" [attr.data-state]="st"
                [style]="box(p)" (click)="pick.emit(t)"
                [attr.aria-label]="'Mesa ' + t.name + ', ' + label(st) + (t.tab ? ', ' + cop(t.tab.total) + ', ' + since(t.tab.openedAt) : '')">
          <span class="name">{{ t.name }}</span>
          @if (t.tab; as tab) {
            <span class="meta">{{ cop(tab.total) }}</span>
            <span class="meta small">{{ label(st) }} · {{ since(tab.openedAt) }}</span>
          } @else {
            <span class="meta small">Libre{{ t.seats ? ' · ' + t.seats : '' }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .plan {
      position: relative;
      width: 100%;
      aspect-ratio: 100 / 70;
      container-type: inline-size;
      border-radius: 1.25rem;
      border: 1px solid var(--surface-border);
      background-color: var(--plan-bg);
      background-image: linear-gradient(var(--plan-grid) 1px, transparent 1px),
        linear-gradient(90deg, var(--plan-grid) 1px, transparent 1px);
      background-size: 5% 7.142857%;
      overflow: hidden;
    }
    .spot {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.1em;
      padding: 0.2em;
      border-radius: 0.9em;
      border: 2px solid var(--table-free-border);
      background: var(--table-free-bg);
      color: var(--table-free-text);
      font-size: clamp(9px, 1.6cqw, 16px);
      line-height: 1.1;
      text-align: center;
      overflow: hidden;
      transition: transform 100ms;
    }
    .spot:active { transform: scale(0.97); }
    .spot.round { border-radius: 9999px; }
    .name { font-weight: 800; font-size: 1.45em; letter-spacing: -0.02em; }
    .meta { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .small { font-weight: 600; font-size: 0.78em; opacity: 0.9; }
    .spot[data-state='ORDERING'] { border-color: var(--table-ordering-border); background: var(--table-ordering-bg); color: var(--table-ordering-text); }
    .spot[data-state='KITCHEN'] { border-color: var(--table-kitchen-border); background: var(--table-kitchen-bg); color: var(--table-kitchen-text); }
    .spot[data-state='READY'] { border-color: var(--table-ready-border); background: var(--table-ready-bg); color: var(--table-ready-text); border-width: 3px; }
    .spot[data-state='EATING'] { border-color: var(--table-eating-border); background: var(--table-eating-bg); color: var(--table-eating-text); }
    .spot[data-state='BILL'] { border-color: var(--table-bill-border); background: var(--table-bill-bg); color: var(--table-bill-text); border-width: 3px; }
  `,
})
export class TablePlanComponent {
  readonly tables = input.required<FloorTable[]>();
  readonly zoneName = input('');
  /** Para el tiempo abierta ("25 min"). */
  readonly now = input<Date>(new Date());
  readonly pick = output<FloorTable>();

  protected readonly placed = computed(() => placeTables(this.tables(), (t) => t.map));
  protected readonly cop = formatCop;
  protected readonly label = stateLabel;
  protected readonly box = boxStyle;

  protected state(t: FloorTable): MapState {
    return t.tab ? t.tab.state : 'FREE';
  }

  protected since(openedAt: string): string {
    return openFor(openedAt, this.now());
  }
}
