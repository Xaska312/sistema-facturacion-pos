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
    id: '2026-11-29',
    title: 'Tus productos en Excel',
    items: [
      'En Productos → Importar, "Descargar mis productos" te da un Excel con todos tus productos, precios y existencias.',
      'Corrígelo y súbelo igual. Con la columna "precio_mayorista" cargas el precio de mayorista de todos.',
      'Si la lista de precios no existe, se crea sola.',
    ],
  },
  {
    id: '2026-11-28',
    title: 'Para bares: precuenta y la noche en un solo día',
    items: [
      'En la cuenta de una mesa, "Imprimir precuenta" saca lo que falta por cobrar y la propina sugerida.',
      'En Ajustes eliges a qué hora empieza el día: con 6:00 a. m., la madrugada cuenta en el día anterior.',
    ],
  },
  {
    id: '2026-11-27',
    title: 'Vender abre más rápido',
    items: [
      'Vender abre enseguida en el equipo donde tienes la caja abierta.',
      'Si una caja lleva más de 24 horas abierta, Vender y Mi caja te avisan para que la cierres y el arqueo cuadre por día.',
      'En Planes y pagos dice claro que los precios son finales: no se cobra IVA.',
    ],
  },
  {
    id: '2026-11-26',
    title: 'Una sede nueva lista en un paso',
    items: [
      'Al crear una sucursal eliges qué tendrá: lo mismo que la principal, un restaurante o solo algunas categorías.',
      'Si es un restaurante, queda con su caja, el salón con sus mesas y su carta.',
      'En Sucursales › Editar eliges qué vende cada sede: en su Vender solo salen esos productos.',
    ],
  },
  {
    id: '2026-11-25',
    title: 'Vender se ve mejor en la tablet',
    items: [
      'En Vender, los productos se acomodan al espacio que hay: en la tablet el precio y lo disponible ya no se parten.',
      'La IA de XASKA ahora se llama solo Aska, en la app, en los planes y en xaska.co.',
    ],
  },
  {
    id: '2026-11-21',
    title: 'Pedidos en el resumen del mes',
    items: [
      'En Reportes → Resumen, "Pedidos del periodo" muestra los pedidos que tomaste y los anticipos que recibiste, aunque los entregues el mes siguiente.',
      'Al terminar una conversación con Aska o con el equipo de XASKA por WhatsApp, te pedimos calificarla de 1 a 5: nos ayuda a mejorar.',
    ],
  },
  {
    id: '2026-11-20',
    title: 'Para bares: cuentas sin mesa',
    items: [
      'En Mesas, "Cuenta sin mesa" abre una cuenta a nombre de alguien que no está en una mesa ("Juan, camisa azul"): pide y paga al final.',
      'En Mesas → Configurar, "Quitar mesas" quita las que sobran; las que ya tuvieron ventas no pierden su historia.',
    ],
  },
  {
    id: '2026-11-18',
    title: 'Más medios de pago y ayuda por WhatsApp',
    items: [
      'En Ajustes → "Otros medios de pago" prende Addi o Sistecrédito, o agrega el que uses (SU+ Pay, Bold…), y cobra con ellos en Vender.',
      'En el cierre de caja y en los reportes salen aparte, para que cuadres lo que te consignan.',
      '¿Dudas? En el menú de tu usuario está "Ayuda por WhatsApp": te responde Aska al instante y, si hace falta, una persona de XASKA.',
    ],
  },
  {
    id: '2026-11-17',
    title: 'Aska, más útil y con cara nueva',
    items: [
      'Pregúntale a Aska a qué hora y qué día vendes más, o qué productos te dejan poca ganancia, incluso por categoría.',
      'En una caja abierta, Aska te dice cuánto efectivo debería haber ahora y de dónde sale.',
      'Pregúntale cómo se hace algo ("¿cómo anulo una venta?") y te da los pasos con el enlace al manual.',
      'Aska estrena logo: la burbuja índigo con la A, abajo a la derecha.',
    ],
  },
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
