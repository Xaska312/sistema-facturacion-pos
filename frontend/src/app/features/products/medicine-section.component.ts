import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, startWith, switchMap } from 'rxjs';
import { CumEntry, MedicinesApi } from '../../core/api/medicines.api';
import {
  CONDITION_OPTIONS,
  KIND_OPTIONS,
  MedicineForm,
  isAntibioticAtc,
  lotsForced,
  medicineProblem,
  needsCondition,
  unitSaleBlock,
} from './medicine-form';

/**
 * Ficha del medicamento en el editor de productos (Fase 13-1, decisión 279), con el módulo Medicamentos: tipo de
 * producto, búsqueda en el catálogo CUM del INVIMA, registro sanitario, principio activo, condición de venta y marcas
 * (antibiótico, nevera, venta por unidad, lotes). El editor guarda la ficha después del producto.
 */
@Component({
  selector: 'app-medicine-section',
  imports: [ReactiveFormsModule, InputTextModule],
  template: `
    <section class="card p-4 flex flex-col gap-3" [formGroup]="form()" aria-labelledby="medicine-title">
      <header>
        <h2 id="medicine-title" class="font-bold tracking-tight">Ficha del medicamento</h2>
        <p class="text-xs text-muted">Lo que pide la inspección: registro INVIMA, principio activo y condición de venta.</p>
      </header>

      <label class="flex flex-col gap-1 md:max-w-xs">
        <span class="text-sm font-medium">Tipo de producto</span>
        <select formControlName="kind" class="border rounded px-2 py-2">
          <option value="">Sin ficha</option>
          @for (k of kinds; track k.code) {
            <option [value]="k.code">{{ k.label }}</option>
          }
        </select>
      </label>

      @if (kind() === 'MEDICINE' || kind() === 'PHYTOTHERAPEUTIC' || kind() === '') {
        <div class="relative flex flex-col gap-1">
          <label for="cum-search" class="text-sm font-medium">Buscar en el catálogo del INVIMA</label>
          <input pInputText id="cum-search" autocomplete="off" placeholder="Nombre, principio activo o CUM"
                 [value]="query()" (input)="search($any($event.target).value)" [disabled]="disabled()"
                 aria-describedby="cum-help" role="combobox" aria-autocomplete="list"
                 [attr.aria-expanded]="results().length > 0" aria-controls="cum-results" />
          <small id="cum-help" class="text-muted">Llena el registro, el CUM y el principio activo. Revisa la presentación.</small>
          @if (results().length > 0) {
            <ul id="cum-results" role="listbox"
                class="absolute top-full left-0 right-0 z-20 mt-1 max-h-80 overflow-auto card p-1 shadow-lg">
              @for (r of results(); track r.cum) {
                <li role="option" aria-selected="false">
                  <button type="button" class="w-full text-left rounded-lg px-3 py-2 hover:bg-brand-soft focus:bg-brand-soft"
                          (click)="pick(r)">
                    <span class="block font-semibold text-sm">{{ r.productName }}</span>
                    <span class="block text-xs">{{ r.activeIngredients }}</span>
                    <span class="block text-xs text-muted">CUM {{ r.cum }} · {{ r.presentation }}</span>
                  </button>
                </li>
              }
            </ul>
          } @else if (searched() && query().trim().length >= 3) {
            <small class="text-muted" role="status">Sin resultados en el catálogo. Puedes llenar la ficha a mano.</small>
          }
        </div>
      }

      @if (kind()) {
        <div class="grid gap-3 md:grid-cols-2">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Registro sanitario INVIMA</span>
            <input pInputText formControlName="sanitaryRegistration" placeholder="INVIMA 2020M-0012345" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">CUM (opcional)</span>
            <input pInputText formControlName="cum" placeholder="19943544-1" inputmode="numeric" />
          </label>
          <label class="flex flex-col gap-1 md:col-span-2">
            <span class="text-sm font-medium">Principio activo y concentración</span>
            <input pInputText formControlName="activeIngredients" placeholder="ACETAMINOFEN 500 mg" />
            <small class="text-muted">Con esto también se encuentra el producto al buscar en Vender y en Productos.</small>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Forma farmacéutica</span>
            <input pInputText formControlName="dosageForm" placeholder="TABLETA" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Vía de administración</span>
            <input pInputText formControlName="route" placeholder="ORAL" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Código ATC</span>
            <input pInputText formControlName="atc" class="uppercase" placeholder="N02BE01" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">Titular del registro</span>
            <input pInputText formControlName="holder" />
          </label>
        </div>

        @if (withCondition()) {
          <fieldset class="flex flex-col gap-2">
            <legend class="text-sm font-medium mb-1">Condición de venta</legend>
            <div class="grid gap-2 md:grid-cols-2">
              @for (c of conditions; track c.code) {
                <label class="flex items-start gap-2 rounded-lg border border-line p-2"
                       [class.border-brand]="condition() === c.code">
                  <input type="radio" formControlName="saleCondition" [value]="c.code" class="mt-1"
                         [attr.disabled]="c.code === 'OTC' && antibiotic() ? true : null" />
                  <span><span class="font-semibold text-sm">{{ c.label }}</span>
                    <small class="block text-muted">{{ c.hint }}</small></span>
                </label>
              }
            </div>
          </fieldset>
        }

        <div class="flex flex-col gap-2">
          @if (kind() === 'MEDICINE') {
            <label class="flex items-start gap-2">
              <input type="checkbox" formControlName="antibiotic" class="mt-1"
                     [attr.disabled]="atcAntibiotic() || disabled() ? true : null" />
              <span>Antibiótico
                <small class="block text-muted">{{ atcAntibiotic() ? 'Su código ATC (J01) lo marca antibiótico.' :
                  'Siempre con fórmula médica y nunca por unidad.' }}</small></span>
            </label>
          }
          <label class="flex items-start gap-2">
            <input type="checkbox" formControlName="coldChain" class="mt-1" />
            <span>Cadena de frío (nevera, 2 a 8 °C)</span>
          </label>
          <label class="flex items-start gap-2">
            <input type="checkbox" formControlName="unitSale" class="mt-1"
                   [attr.disabled]="unitBlock() || disabled() ? true : null" />
            <span>Se puede vender por unidad (sobre, blíster)
              <small class="block text-muted">{{ unitBlock() ?? 'Solo si cada unidad conserva su empaque con lote y vencimiento. Configúrala en Presentaciones.' }}</small></span>
          </label>
          <label class="flex items-start gap-2">
            <input type="checkbox" formControlName="tracksLots" class="mt-1"
                   [attr.disabled]="forcedLots() || disabled() ? true : null" />
            <span>Controla lotes y vencimientos
              <small class="block text-muted">{{ forcedLots() ? 'Obligatorio en medicamentos, fitoterapéuticos y dispositivos médicos: al recibir la compra se pide el lote y el vencimiento.'
                : 'Márcalo si quieres registrar el lote y el vencimiento al recibir este producto.' }}</small></span>
          </label>
        </div>

        @if (problem(); as p) {
          <p class="text-sm text-danger" role="alert">{{ p }}</p>
        }
      }
    </section>
  `,
})
export class MedicineSectionComponent implements OnInit {
  readonly form = input.required<MedicineForm>();
  readonly disabled = input(false);
  /** Se eligió una presentación del catálogo: el editor sugiere nombre e impuesto. */
  readonly picked = output<CumEntry>();

  private readonly api = inject(MedicinesApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly terms = new Subject<string>();

  protected readonly kinds = KIND_OPTIONS;
  protected readonly conditions = CONDITION_OPTIONS;
  protected readonly query = signal('');
  protected readonly searched = signal(false);
  protected readonly results = signal<CumEntry[]>([]);
  private readonly value = signal(0);

  protected readonly kind = computed(() => (this.value(), this.form().controls.kind.value));
  protected readonly condition = computed(() => (this.value(), this.form().controls.saleCondition.value));
  protected readonly withCondition = computed(() => needsCondition(this.kind()));
  protected readonly atcAntibiotic = computed(() => (this.value(), isAntibioticAtc(this.form().controls.atc.value)));
  protected readonly antibiotic = computed(() => (this.value(),
    this.kind() === 'MEDICINE' && (this.form().controls.antibiotic.value || this.atcAntibiotic())));
  protected readonly unitBlock = computed(() => unitSaleBlock(this.kind(), this.condition(), this.antibiotic()));
  protected readonly forcedLots = computed(() => lotsForced(this.kind()));
  protected readonly problem = computed(() => (this.value(), medicineProblem(this.form())));

  ngOnInit(): void {
    const form = this.form();
    form.valueChanges.pipe(startWith(null), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      // Mantiene las reglas: antibiótico por ATC, sin venta libre ni por unidad cuando no aplica.
      const atcAntibiotic = isAntibioticAtc(form.controls.atc.value) && form.controls.kind.value === 'MEDICINE';
      if (atcAntibiotic && !form.controls.antibiotic.value) {
        form.controls.antibiotic.setValue(true, { emitEvent: false });
      }
      const antibiotic = form.controls.kind.value === 'MEDICINE' && form.controls.antibiotic.value;
      if (antibiotic && form.controls.saleCondition.value === 'OTC') {
        form.controls.saleCondition.setValue('PRESCRIPTION', { emitEvent: false });
      }
      if (form.controls.unitSale.value
        && unitSaleBlock(form.controls.kind.value, form.controls.saleCondition.value, antibiotic)) {
        form.controls.unitSale.setValue(false, { emitEvent: false });
      }
      if (lotsForced(form.controls.kind.value) && !form.controls.tracksLots.value) {
        form.controls.tracksLots.setValue(true, { emitEvent: false });
      }
      this.value.update((n) => n + 1);
    });
    this.terms.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((q) => (q.trim().length < 3 ? of([] as CumEntry[])
        : this.api.searchCatalog(q.trim()).pipe(catchError(() => of([] as CumEntry[]))))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((list) => {
      this.results.set(list);
      this.searched.set(true);
    });
  }

  protected search(q: string): void {
    this.query.set(q);
    this.searched.set(false);
    this.terms.next(q);
  }

  protected pick(entry: CumEntry): void {
    this.results.set([]);
    this.query.set('');
    this.searched.set(false);
    this.picked.emit(entry);
  }
}
