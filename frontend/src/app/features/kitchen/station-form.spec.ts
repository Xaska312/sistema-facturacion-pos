import { KitchenStation } from '../../core/api/kitchen.api';
import { comandaHtml } from './comanda-print';
import { emptyStation, stationDraft, stationProblem, stationReceives, toStationInput } from './station-form';

const cocina: KitchenStation = { id: 's1', name: 'Cocina', main: true, position: 0, active: true, categories: [], products: [] };
const bar: KitchenStation = {
  id: 's2', name: 'Bar', main: false, position: 1, active: true,
  categories: [{ id: 'c1', name: 'Bebidas' }, { id: 'c2', name: 'Licores' }], products: [{ id: 'p1', name: 'Limonada' }],
};

describe('estaciones de cocina (Fase 12b-3)', () => {
  it('dice qué recibe cada estación; la principal, lo que no tenga otra', () => {
    expect(stationReceives(cocina)).toBe('Todo lo que no tenga otra estación');
    expect(stationReceives(bar)).toBe('Bebidas, Licores y Limonada');
    expect(stationReceives({ ...bar, categories: [], products: [] })).toContain('Aún no recibe nada');
  });

  it('valida el nombre sin repetir y la principal siempre queda activa', () => {
    const draft = emptyStation();
    expect(stationProblem(draft, [cocina])).toContain('Escribe el nombre');
    draft.name = ' cocina ';
    expect(stationProblem(draft, [cocina])).toContain('Ya hay');
    draft.name = 'Parrilla';
    expect(stationProblem(draft, [cocina, bar])).toBeNull();
    const main = { ...stationDraft(cocina), active: false };
    expect(toStationInput(main).active).toBeTrue();
    expect(toStationInput(stationDraft(bar))).toEqual({
      name: 'Bar', main: false, active: true, categoryIds: ['c1', 'c2'], productIds: ['p1'],
    });
  });
});

describe('comanda impresa (Fase 12b-3)', () => {
  it('lleva la estación, la mesa y el término destacado, y escapa el texto', () => {
    const html = comandaHtml({
      id: 't', number: 12, branchId: 'b', tabId: 'x', tabLabel: 'Mesa 4', kind: 'TABLE', guests: 3, notes: 'cumpleaños',
      stationId: 's1', stationName: 'Cocina', sentAt: '2026-10-30T17:00:00Z', sentByName: 'Ana', status: 'NEW', printCount: 2,
      items: [
        { id: 'i1', name: 'Hamburguesa', quantity: 2, note: 'sin <cebolla>', voided: false, modifiers: [
          { groupName: 'Término', name: 'Medio', quantity: 1, highlight: true },
          { groupName: 'Extras', name: 'Tocineta', quantity: 1, highlight: false }] },
        { id: 'i2', name: 'Papas', quantity: 1, note: null, voided: true, modifiers: [] },
      ],
    }, 58);
    expect(html).toContain('COCINA');
    expect(html).toContain('#12');
    expect(html).toContain('Mesa 4 · 3 pers.');
    expect(html).toContain('TÉRMINO: MEDIO');
    expect(html).toContain('+ Tocineta');
    expect(html).toContain('* sin &lt;cebolla&gt;');
    expect(html).toContain('ANULADO');
    expect(html).toContain('COPIA 2');
    expect(html).toContain('width:58mm');
  });
});
