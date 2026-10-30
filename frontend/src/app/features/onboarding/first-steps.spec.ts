import {
  FirstStepCounts,
  buildFirstSteps,
  buildRestaurantSteps,
  dismissFirstSteps,
  firstStepsKey,
  firstStepsProgress,
  isFirstStepsDismissed,
  restoreFirstSteps,
} from './first-steps';

const fresh: FirstStepCounts = {
  branches: 1, categories: 0, products: 0, stockDocuments: 0, team: 1, cashSessions: 0, sales: 0,
};

describe('primeros pasos', () => {
  it('un negocio recién creado ya tiene la sucursal y sigue con las categorías', () => {
    const steps = buildFirstSteps(fresh);
    expect(steps.map((s) => s.id)).toEqual(['branch', 'categories', 'products', 'stock', 'team', 'cash', 'sale']);
    const progress = firstStepsProgress(steps);
    expect(progress.done).toBe(1);
    expect(progress.total).toBe(7);
    expect(progress.percent).toBe(14);
    expect(progress.next?.id).toBe('categories');
    expect(progress.complete).toBeFalse();
  });

  it('invitar al equipo es opcional: sin él la lista queda completa', () => {
    const steps = buildFirstSteps({ ...fresh, categories: 3, products: 20, stockDocuments: 1, cashSessions: 1, sales: 1 });
    const progress = firstStepsProgress(steps);
    expect(progress.complete).toBeTrue();
    expect(progress.next?.id).toBe('team');
    expect(progress.done).toBe(6);
  });

  it('un dato desconocido (sin permiso o con error) deja el paso pendiente', () => {
    const steps = buildFirstSteps({ ...fresh, sales: null });
    expect(steps.find((s) => s.id === 'sale')?.done).toBeFalse();
  });

  it('recuerda que se ocultó, por usuario y negocio', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    } as Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> as Storage;
    const key = firstStepsKey('u1', 't1');
    expect(key).toBe('pos.first-steps.u1.t1');
    expect(isFirstStepsDismissed(key, storage)).toBeFalse();
    dismissFirstSteps(key, storage);
    expect(isFirstStepsDismissed(key, storage)).toBeTrue();
    expect(isFirstStepsDismissed(firstStepsKey('u2', 't1'), storage)).toBeFalse();
    restoreFirstSteps(key, storage);
    expect(isFirstStepsDismissed(key, storage)).toBeFalse();
    expect(isFirstStepsDismissed(key, null)).toBeFalse();
  });
});

describe('primeros pasos de un restaurante', () => {
  const restaurant = { ...fresh, tables: 0, modifierGroups: 0, stations: 1, consumptionTax: 0 };

  it('empieza por las mesas y no pide existencias', () => {
    const steps = buildRestaurantSteps(restaurant, new Set(['module:tables', 'module:modifiers', 'module:kitchen']));
    expect(steps.map((s) => s.id)).toEqual(['tables', 'categories', 'products', 'modifiers', 'stations', 'tips', 'team',
      'cash', 'sale']);
    expect(firstStepsProgress(steps).next?.id).toBe('tables');
    expect(steps.find((s) => s.id === 'sale')?.route).toBe('/app/mesas');
  });

  it('sin adiciones ni cocina esos pasos no salen; lo opcional no impide terminar', () => {
    const steps = buildRestaurantSteps({ ...restaurant, tables: 8, categories: 3, products: 20, cashSessions: 1, sales: 1 },
      new Set(['module:tables']));
    expect(steps.map((s) => s.id)).not.toContain('modifiers');
    expect(steps.map((s) => s.id)).not.toContain('stations');
    expect(firstStepsProgress(steps).complete).toBeTrue();
  });
});
