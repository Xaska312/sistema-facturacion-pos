import { Component, OnInit, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { Category } from '../../core/api/api.models';
import { CatalogApi } from '../../core/api/catalog.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { problemMessage } from '../../core/errors/problem';

/**
 * Asistente del impuesto al consumo (Fase 12b-5, decisión 272): un restaurante responsable de INC cobra el 8 % en
 * lugar del IVA en lo que prepara. Pregunta si el negocio es responsable y, si sí, asigna "INC 8 %" a las categorías
 * de comidas y bebidas preparadas que se elijan. Las ventas anteriores no cambian.
 */
@Component({
  selector: 'app-consumption-tax-section',
  imports: [ButtonModule],
  template: `
    <section class="card p-5 mt-6 max-w-3xl" aria-labelledby="inc-title">
      <h2 id="inc-title" class="text-base font-bold tracking-tight">Impuesto al consumo (INC 8 %)</h2>
      <p class="text-sm text-muted mt-1">
        Los restaurantes, cafeterías y bares responsables del impuesto al consumo cobran el 8 % en lo que preparan, en
        lugar del IVA. Si tienes dudas, pregúntale a tu contador antes de aplicarlo.
      </p>

      <fieldset class="mt-4">
        <legend class="text-sm font-semibold mb-2">¿Tu negocio es responsable del impuesto al consumo?</legend>
        <div class="flex flex-wrap gap-2" role="radiogroup">
          <button type="button" class="choice" role="radio" [attr.aria-checked]="answer() === 'yes'" (click)="answer.set('yes')">Sí</button>
          <button type="button" class="choice" role="radio" [attr.aria-checked]="answer() === 'no'" (click)="answer.set('no')">No</button>
        </div>
      </fieldset>

      @if (answer() === 'no') {
        <p class="text-sm mt-3">Entonces tus productos siguen con el impuesto que ya tienen (IVA, exento o excluido).</p>
      }
      @if (answer() === 'yes') {
        @if (!canProducts()) {
          <p class="text-sm mt-3">Para asignarlo necesitas también el permiso de administrar productos.</p>
        } @else {
          <p class="text-sm font-semibold mt-4 mb-2">¿Qué categorías son comidas y bebidas que preparas?</p>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Categorías con INC">
            @for (c of categories(); track c.id) {
              <label class="chip" [class.chip--on]="chosen().has(c.id)">
                <input type="checkbox" class="sr-only" [checked]="chosen().has(c.id)" (change)="toggle(c.id)" />
                {{ c.name }}
              </label>
            } @empty {
              <p class="text-sm text-muted">Aún no tienes categorías. Créalas en Ajustes de catálogo.</p>
            }
          </div>
          <p class="text-xs text-muted mt-2">
            Se aplica a todos sus productos (y a los de sus subcategorías). Con precios con impuesto incluido el precio de
            venta no cambia: cambia cuánto es base y cuánto impuesto. A los productos que crees después en esas
            categorías elígeles "INC 8 %", o vuelve a aplicarlo aquí.
          </p>
          <div class="flex flex-wrap items-center gap-3 mt-3">
            <p-button label="Aplicar INC 8 %" icon="pi pi-check" [loading]="saving()" [disabled]="chosen().size === 0"
                      (onClick)="apply()" />
            @if (result(); as r) {
              <span class="text-sm text-success font-semibold" role="status">
                Listo: {{ r.products === 1 ? '1 producto quedó' : r.products + ' productos quedaron' }} con {{ r.taxName }}.
              </span>
            }
          </div>
        }
      }
    </section>
  `,
  styles: `
    .choice, .chip {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
      padding: 0 1rem;
      border-radius: 9999px;
      border: 1px solid var(--surface-border);
      background: var(--surface);
      font-weight: 600;
      cursor: pointer;
    }
    .choice[aria-checked='true'], .chip--on { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-soft-text); }
    .chip:has(input:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
  `,
})
export class ConsumptionTaxSectionComponent implements OnInit {
  private readonly catalog = inject(CatalogApi);
  private readonly messages = inject(MessageService);

  protected readonly canProducts = permissionFlag('products:manage');
  protected readonly answer = signal<'yes' | 'no' | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly chosen = signal<ReadonlySet<string>>(new Set());
  protected readonly saving = signal(false);
  protected readonly result = signal<{ products: number; taxName: string } | null>(null);

  ngOnInit(): void {
    this.catalog.categories().subscribe({
      next: (list) => this.categories.set(list.filter((c) => c.active)),
      error: () => this.categories.set([]),
    });
  }

  protected toggle(id: string): void {
    const next = new Set(this.chosen());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.chosen.set(next);
    this.result.set(null);
  }

  protected apply(): void {
    this.saving.set(true);
    this.catalog.applyConsumptionTax([...this.chosen()]).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.result.set(r);
        this.messages.add({ severity: 'success', summary: 'Impuesto al consumo aplicado', detail: `${r.products} productos con ${r.taxName}.` });
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'No se aplicó', detail: problemMessage(e) });
      },
    });
  }
}
