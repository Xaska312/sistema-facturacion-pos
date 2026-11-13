import { ChangeDetectionStrategy, Component, computed, input, numberAttribute, output } from '@angular/core';
import { ICON_ANGLE_DOUBLE_LEFT, ICON_ANGLE_DOUBLE_RIGHT, ICON_ANGLE_LEFT, ICON_ANGLE_RIGHT, ICON_CHEVRON_DOWN } from './icons';

/** Cambio de página (mismos campos que `PaginatorState` de PrimeNG). */
export interface PageChange {
  first: number;
  rows: number;
  page: number;
  pageCount: number;
}

/**
 * Paginador (decisión 340; reemplaza a `p-paginator` con las mismas entradas): primera, anterior, números de página
 * (`pageLinkSize` visibles, con el mismo cálculo que PrimeNG), siguiente, última y, si hay `rowsPerPageOptions`, el
 * selector de filas por página (un `<select>` nativo con el aspecto del de PrimeNG).
 */
@Component({
  selector: 'app-paginator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ui-paginator' },
  template: `
    <button type="button" class="ui-paginator-nav" aria-label="Primera página" [disabled]="isFirst()" (click)="go(0)">
      <svg class="ui-paginator-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" [attr.d]="icons.first" />
      </svg>
    </button>
    <button type="button" class="ui-paginator-nav" aria-label="Página anterior" [disabled]="isFirst()"
            (click)="go(page() - 1)">
      <svg class="ui-paginator-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path fill="currentColor" [attr.d]="icons.prev" />
      </svg>
    </button>
    <span class="ui-paginator-pages">
      @for (p of links(); track p) {
        <button type="button" class="ui-paginator-nav ui-paginator-page" [class.ui-paginator-page-selected]="p === page()"
                [attr.aria-label]="'Página ' + (p + 1)" [attr.aria-current]="p === page() ? 'page' : null"
                (click)="go(p)">{{ p + 1 }}</button>
      }
    </span>
    <button type="button" class="ui-paginator-nav" aria-label="Página siguiente" [disabled]="isLast()"
            (click)="go(page() + 1)">
      <svg class="ui-paginator-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path fill="currentColor" [attr.d]="icons.next" />
      </svg>
    </button>
    <button type="button" class="ui-paginator-nav" aria-label="Última página" [disabled]="isLast()"
            (click)="go(pageCount() - 1)">
      <svg class="ui-paginator-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" [attr.d]="icons.last" />
      </svg>
    </button>
    @if (rowsPerPageOptions()?.length) {
      <span class="ui-select">
        <span class="ui-select-label" aria-hidden="true">{{ rows() }}</span>
        <span class="ui-select-dropdown" aria-hidden="true">
          <svg class="ui-paginator-icon" viewBox="0 0 14 14" fill="none">
            <path fill="currentColor" [attr.d]="icons.chevron" />
          </svg>
        </span>
        <select class="ui-select-native" aria-label="Filas por página" [value]="rows()"
                (change)="changeRows($any($event.target).value)">
          @for (option of rowsPerPageOptions(); track option) {
            <option [value]="option" [selected]="option === rows()">{{ option }}</option>
          }
        </select>
      </span>
    }
  `,
})
export class PaginatorComponent {
  readonly first = input(0, { transform: numberAttribute });
  readonly rows = input(10, { transform: numberAttribute });
  readonly totalRecords = input(0, { transform: numberAttribute });
  readonly rowsPerPageOptions = input<number[] | null | undefined>(undefined);
  readonly pageLinkSize = input(5, { transform: numberAttribute });
  readonly pageChange = output<PageChange>();

  protected readonly icons = {
    first: ICON_ANGLE_DOUBLE_LEFT,
    prev: ICON_ANGLE_LEFT,
    next: ICON_ANGLE_RIGHT,
    last: ICON_ANGLE_DOUBLE_RIGHT,
    chevron: ICON_CHEVRON_DOWN,
  };

  protected readonly pageCount = computed(() => Math.ceil(this.totalRecords() / this.rows()) || 1);
  protected readonly page = computed(() => Math.floor(this.first() / this.rows()));
  protected readonly isFirst = computed(() => this.page() === 0);
  protected readonly isLast = computed(() => this.page() === this.pageCount() - 1);

  /** Números visibles alrededor de la página actual (mismo cálculo que PrimeNG). */
  protected readonly links = computed(() => {
    const count = this.pageCount();
    const visible = Math.min(this.pageLinkSize(), count);
    let start = Math.max(0, Math.ceil(this.page() - visible / 2));
    const end = Math.min(count - 1, start + visible - 1);
    start = Math.max(0, start - (this.pageLinkSize() - (end - start + 1)));
    const pages: number[] = [];
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  });

  protected go(page: number): void {
    const target = Math.max(0, Math.min(page, this.pageCount() - 1));
    if (target === this.page()) {
      return;
    }
    this.pageChange.emit({ first: target * this.rows(), rows: this.rows(), page: target, pageCount: this.pageCount() });
  }

  protected changeRows(value: string): void {
    const rows = Number(value);
    this.pageChange.emit({ first: 0, rows, page: 0, pageCount: Math.ceil(this.totalRecords() / rows) || 1 });
  }
}
