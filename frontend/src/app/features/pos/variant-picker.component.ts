import { Component, computed, input, output } from '@angular/core';
import { ProductModel, ProductVariant } from '../../core/api/api.models';
import { formatCop } from '../../shared/money';
import { modelGrid } from '../products/models/model-grid';
import { stockLabel } from './pos-labels';

/**
 * Elegir la talla (y el color) de un modelo en el POS (fase 8d): una fila por color y un botón por talla con su
 * existencia en la sucursal. Las tallas inactivas no se pueden elegir; las agotadas se ven en rojo.
 */
@Component({
  selector: 'app-variant-picker',
  template: `
    @let m = model();
    <p class="text-sm text-muted mb-3">
      {{ cop(m.salePrice) }} · {{ m.sizeScaleName }}
      @if (hasStock()) {
        · {{ available() }} {{ available() === 1 ? 'unidad disponible' : 'unidades disponibles' }}
      }
    </p>
    <div class="flex flex-col gap-3">
      @for (color of grid().colors; track color) {
        <div role="group" [attr.aria-label]="color ? 'Color ' + color : 'Tallas'">
          @if (color) {
            <p class="text-sm font-medium mb-1.5">{{ color }}</p>
          }
          <div class="flex flex-wrap gap-2">
            @for (size of grid().sizes; track size) {
              @if (activeAt(color, size); as v) {
                @let label = stock(v);
                <button type="button" class="size-btn" [class.out]="label === 'Agotado'" [disabled]="disabled()"
                        [attr.aria-label]="'Talla ' + size + (color ? ' ' + color : '') + (label ? ', ' + label : '')"
                        (click)="pick.emit(v)">
                  <span class="text-lg font-semibold leading-none">{{ size }}</span>
                  @if (label) {
                    <span class="text-xs leading-none" [class.text-muted]="label !== 'Agotado'">{{ label }}</span>
                  }
                </button>
              } @else {
                <span class="size-btn size-off">
                  <span class="text-lg leading-none">{{ size }}</span>
                  <span class="text-xs leading-none" aria-hidden="true">—</span>
                  <span class="sr-only">no disponible</span>
                </span>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .size-btn {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      min-width: 4rem;
      min-height: 3.5rem;
      padding: 0.375rem 0.5rem;
      border-radius: 0.625rem;
      border: 1px solid var(--surface-border);
      background: var(--surface);
      transition: border-color 0.15s, transform 0.1s;
    }
    button.size-btn:hover:not(:disabled) {
      border-color: var(--brand);
    }
    button.size-btn:active:not(:disabled) {
      transform: scale(0.97);
    }
    .size-btn.out {
      border-color: var(--danger-soft);
      color: var(--danger);
    }
    .size-off {
      opacity: 0.4;
    }
  `,
})
export class VariantPickerComponent {
  readonly model = input.required<ProductModel>();
  /** Existencia por producto en la sucursal de la caja; vacía si el usuario no ve inventario. */
  readonly stockMap = input<ReadonlyMap<string, number>>(new Map());
  readonly disabled = input(false);
  readonly pick = output<ProductVariant>();

  protected readonly cop = formatCop;
  protected readonly grid = computed(() => modelGrid(this.model()));
  protected readonly hasStock = computed(() => this.stockMap().size > 0);
  protected readonly available = computed(() => this.model().variants
    .filter((v) => v.active)
    .reduce((sum, v) => sum + Math.max(0, this.stockMap().get(v.productId) ?? 0), 0));

  /** La talla en ese color si existe y está activa. */
  protected activeAt(color: string | null, size: string): ProductVariant | null {
    const variant = this.grid().at(color, size);
    return variant?.active ? variant : null;
  }

  protected stock(variant: ProductVariant): string | null {
    return stockLabel(this.stockMap().get(variant.productId));
  }
}
