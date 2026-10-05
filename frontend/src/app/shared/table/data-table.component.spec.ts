import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { PageResponse } from '../../core/api/api.models';
import { StatusKey } from '../status';
import { ViewportService } from '../viewport';
import { CellTemplateDirective } from './cell-template.directive';
import { DataTableComponent } from './data-table.component';
import { ColumnDef, TableQuery } from './table';

interface Row {
  id: string;
  name: string;
  price: number;
  status: StatusKey;
}

@Component({
  imports: [DataTableComponent, CellTemplateDirective],
  template: `
    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    searchPlaceholder="Buscar productos" initialSort="name,asc" emptyTitle="Aún no hay productos"
                    emptyActionLabel="Crear producto" (queryChange)="queries.push($event)" (emptyAction)="created = true">
      <span tableToolbar class="extra-filter">Filtro</span>
      <ng-template appCell="name" let-row><a class="custom-name">{{ row.name }}</a></ng-template>
      <ng-template #actions let-row><button type="button" class="row-action">Ver {{ row.id }}</button></ng-template>
    </app-data-table>
  `,
})
class HostComponent {
  readonly page = signal<PageResponse<Row> | null>(null);
  readonly loading = signal(false);
  readonly queries: TableQuery[] = [];
  created = false;
  readonly trackById = (row: Row): string => row.id;
  readonly columns: ColumnDef<Row>[] = [
    { header: 'Nombre', cell: (r) => r.name, sortField: 'name', template: 'name' },
    { header: 'Precio', cell: (r) => r.price, kind: 'money', sortField: 'salePrice' },
    { header: 'Estado', cell: (r) => r.status, kind: 'status' },
  ];
}

function pageOf(content: Row[], total = content.length): PageResponse<Row> {
  return { content, page: 0, size: 20, totalElements: total, totalPages: Math.ceil(total / 20) };
}

describe('DataTableComponent', () => {
  const isDesktop = signal(true);

  beforeEach(() => {
    isDesktop.set(true);
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideNoopAnimations(), { provide: ViewportService, useValue: { isDesktop } }],
    });
  });

  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance, element: fixture.nativeElement as HTMLElement };
  }

  it('pinta filas con celdas por tipo, plantillas, acciones y filtros extra', () => {
    const { fixture, host, element } = setup();
    host.page.set(pageOf([{ id: '1', name: 'Gaseosa', price: 2500, status: 'voided' }], 45));
    fixture.detectChanges();

    expect(element.querySelector('.custom-name')?.textContent).toBe('Gaseosa');
    const priceCell = element.querySelectorAll('tbody td')[1];
    expect(priceCell.textContent).toContain('2.500');
    expect(priceCell.className).toContain('text-right');
    expect(element.textContent).toContain('Anulada');
    expect(element.querySelector('.row-action')?.textContent).toContain('Ver 1');
    expect(element.querySelector('.extra-filter')).not.toBeNull();
    expect(element.textContent).toContain('1–20 de 45');
  });

  it('muestra esqueleto mientras carga la primera vez', () => {
    const { fixture, host, element } = setup();
    host.loading.set(true);
    fixture.detectChanges();
    expect(element.querySelectorAll('p-skeleton').length).toBeGreaterThan(0);
  });

  it('estado vacío con acción', () => {
    const { fixture, host, element } = setup();
    host.page.set(pageOf([]));
    fixture.detectChanges();
    expect(element.textContent).toContain('Aún no hay productos');
    const button = Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.includes('Crear producto'));
    button?.click();
    expect(host.created).toBeTrue();
  });

  it('ordena al hacer clic en el encabezado (asc → desc → inicial)', () => {
    const { fixture, host, element } = setup();
    host.page.set(pageOf([{ id: '1', name: 'A', price: 1, status: 'active' }]));
    fixture.detectChanges();
    const priceHeader = element.querySelectorAll('thead th')[1];
    const button = priceHeader.querySelector('button');

    button?.click();
    fixture.detectChanges();
    expect(host.queries.at(-1)).toEqual({ page: 0, size: 20, sort: 'salePrice,asc', search: null });
    expect(priceHeader.getAttribute('aria-sort')).toBe('ascending');

    button?.click();
    button?.click();
    expect(host.queries.at(-1)?.sort).toBe('name,asc');
  });

  it('busca con debounce y vuelve a la primera página', fakeAsync(() => {
    const { fixture, host, element } = setup();
    const input = element.querySelector<HTMLInputElement>('input[type="search"]');
    expect(input?.getAttribute('aria-label')).toBe('Buscar productos');
    input!.value = 'gas';
    input!.dispatchEvent(new Event('input'));
    tick(100);
    expect(host.queries.length).toBe(0);
    tick(400);
    fixture.detectChanges();
    expect(host.queries.at(-1)).toEqual({ page: 0, size: 20, sort: 'name,asc', search: 'gas' });
  }));

  it('en pantallas pequeñas muestra tarjetas en lugar de la tabla', () => {
    const { fixture, host, element } = setup();
    isDesktop.set(false);
    host.page.set(pageOf([{ id: '1', name: 'Gaseosa', price: 2500, status: 'active' }]));
    fixture.detectChanges();
    expect(element.querySelector('table')).toBeNull();
    const card = element.querySelector('li');
    expect(card?.textContent).toContain('Precio');
    expect(card?.textContent).toContain('2.500');
    expect(card?.querySelector('.row-action')).not.toBeNull();
  });
});
