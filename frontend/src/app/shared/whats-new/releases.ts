/**
 * Novedades de XASKA POS (decisión 354), la más reciente primero. Cada versión que cambia algo visible para el negocio
 * agrega una entrada aquí: un título corto y 2 a 4 puntos en palabras del comerciante (qué puede hacer ahora y dónde),
 * nunca detalles técnicos. El id es la fecha (AAAA-MM-DD) y sirve para saber qué ya vio cada persona.
 */
export interface Release {
  id: string;
  title: string;
  items: readonly string[];
}

export const RELEASES: readonly Release[] = [
  {
    id: '2026-11-16',
    title: 'Vender sin internet, más completo',
    items: [
      'Sin internet ahora ves los productos y las categorías en Vender, no solo el lector y la búsqueda.',
      'El botón "Abrir cajón" y su tecla funcionan sin internet; el registro llega a la auditoría al volver la conexión.',
      'Novedades como esta te aparecen en Inicio, y siempre las encuentras en el menú de tu usuario.',
    ],
  },
  {
    id: '2026-11-13',
    title: 'Tu ganancia, bien calculada',
    items: [
      'El costo se escribe como te lo cobra el proveedor, con IVA, y la app le quita el IVA para calcular la ganancia.',
      'Cada producto te dice cuánto ganas por unidad, el porcentaje sobre el costo y el margen.',
      'En Productos → "Revisar costos con IVA" corriges los costos que ya habías escrito con IVA.',
    ],
  },
  {
    id: '2026-11-12',
    title: 'Atajos y recordatorios',
    items: [
      'La tecla F8 abre el cajón monedero en Vender (la cambias en Ajustes → Impresora).',
      'El mensaje para recordar el fiado por WhatsApp ahora lo escribes tú, en Ajustes → Fiados.',
      'Desde el menú de tu usuario puedes cerrar tu sesión en los otros equipos.',
    ],
  },
];

/** Las versiones que la persona aún no ha visto (todas las posteriores a la última que vio). */
export function unseenReleases(releases: readonly Release[], seenId: string | null): Release[] {
  return seenId === null ? releases.slice(0, 1) : releases.filter((r) => r.id > seenId);
}
