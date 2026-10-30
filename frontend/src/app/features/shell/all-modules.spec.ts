import { MENU } from './menu';
import { groupModules, normalizeSearch } from './all-modules.component';

describe('Todo (decisión 263)', () => {
  it('agrupa los módulos por sección, sin Inicio', () => {
    const groups = groupModules(MENU, '');
    expect(groups.map((g) => g.section)).toEqual(['Ventas', 'Reportes', 'Catálogo', 'Inventario', 'Terceros', 'Configuración']);
    expect(groups.flatMap((g) => g.items).some((i) => i.label === 'Inicio')).toBeFalse();
  });

  it('busca sin tildes ni mayúsculas', () => {
    expect(normalizeSearch('  Auditoría ')).toBe('auditoria');
    const found = groupModules(MENU, 'AUDITORIA');
    expect(found.map((g) => g.items.map((i) => i.label))).toEqual([['Auditoría']]);
    expect(groupModules(MENU, 'caja').flatMap((g) => g.items.map((i) => i.label)))
      .toEqual(['Mi caja', 'Historial de caja', 'Cajas']);
    expect(groupModules(MENU, 'zzz')).toEqual([]);
  });
});
