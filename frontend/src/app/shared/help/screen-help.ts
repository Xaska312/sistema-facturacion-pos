import { TourId } from '../tour/tour';
import { GlossaryTerm } from './glossary';

/** Ayuda de una pantalla: 3–4 consejos, términos del glosario relacionados y su recorrido guiado si tiene. */
export interface HelpTopic {
  title: string;
  tips: readonly string[];
  terms?: readonly GlossaryTerm[];
  tour?: TourId;
  /** Permiso para ver la parte de la pantalla que recorre el tour (el tablero solo lo ve quien tiene reportes). */
  tourPermission?: string;
}

/** Por ruta; se usa la ruta más larga que coincide con la URL ("/app" solo en el inicio exacto). */
export const SCREEN_HELP: Readonly<Record<string, HelpTopic>> = {
  '/app': {
    title: 'Inicio',
    tips: [
      'Los botones de arriba llevan a lo que más usas: vender, tu caja y los reportes.',
      'Si eres el dueño, la lista de primeros pasos te guía hasta tu primera venta.',
      'En el tablero cambia el periodo (hoy, 7 días, mes…) y la sucursal; el enlace se puede compartir.',
      'Las alertas de existencias te avisan qué productos reponer.',
    ],
    terms: ['stock-minimo'],
    tour: 'dashboard',
    tourPermission: 'reports:read',
  },
  '/app/caja': {
    title: 'Mi caja',
    tips: [
      'Abre la caja al empezar el turno contando el efectivo del cajón (la base).',
      'Registra como ingreso o egreso el efectivo que entra o sale sin ser una venta (por ejemplo, pagar un domicilio).',
      'Un retiro es dinero que sacas para guardarlo; no es un gasto.',
      'Al cerrar, cuenta billetes y monedas y escribe el total: el sistema calcula si cuadra.',
    ],
    terms: ['base-efectivo', 'cierre-ciego', 'arqueo'],
  },
  '/app/caja/historial': {
    title: 'Historial de caja',
    tips: [
      'Cada fila es un turno de caja, desde que se abrió hasta que se cerró.',
      'Abre el informe de un turno para ver las ventas por medio de pago, las anulaciones y el efectivo.',
      'Si no ves la diferencia del arqueo es porque tu usuario no supervisa cajas (cierre ciego).',
    ],
    terms: ['arqueo', 'cierre-ciego'],
  },
  '/app/ventas': {
    title: 'Ventas',
    tips: [
      'Busca por número de venta (POS-12) o por el nombre del cliente.',
      'Desde el detalle puedes reimprimir el tiquete.',
      'Anular una venta devuelve las existencias y el efectivo; se pide un motivo y queda registrada.',
    ],
  },
  '/app/reportes': {
    title: 'Reportes',
    tips: [
      'Elige el periodo y la sucursal arriba; cada pestaña muestra una vista del mismo periodo.',
      'Exporta cualquier pestaña a Excel (CSV) con el botón de arriba.',
      'El valor del inventario usa el costo promedio de cada producto.',
    ],
    terms: ['medios-pago', 'costo-promedio'],
  },
  '/app/auditoria': {
    title: 'Auditoría',
    tips: [
      'Cada fila es algo que alguien hizo en el negocio: vender, anular, abrir o cerrar caja, cambiar precios o permisos, entrar al sistema.',
      'Filtra por fechas, usuario o módulo; la búsqueda encuentra nombres, números de venta y códigos dentro de los datos.',
      'En "Ver", lo resaltado es lo que cambió (antes y después).',
      'Los registros no se pueden modificar ni borrar, y exportar la auditoría o un reporte también queda registrado.',
    ],
  },
  '/app/productos': {
    title: 'Productos',
    tips: [
      'Crea productos uno a uno o impórtalos desde un archivo CSV (puedes abrirlo en Excel).',
      'Marca "controla inventario" en lo que tienes en bodega; los servicios no lo necesitan.',
      'Un producto puede tener varios códigos de barras y presentaciones (por ejemplo, caja de 24).',
      'Desactivar un producto lo oculta del POS sin borrar su historia.',
    ],
    terms: ['costo-promedio', 'lista-precios'],
  },
  '/app/productos/importar': {
    title: 'Importar productos',
    tips: [
      'Descarga la plantilla, llénala en Excel y guárdala como CSV.',
      'Primero revisa: el sistema te dice qué filas tienen errores antes de guardar nada.',
      'Si un SKU ya existe, ese producto se actualiza.',
    ],
  },
  '/app/catalogo': {
    title: 'Ajustes de catálogo',
    tips: [
      'Las categorías agrupan tus productos en el POS y en los reportes.',
      'Los impuestos de Colombia ya vienen creados; usa el que corresponda a cada producto.',
      'Las listas de precios sirven para clientes con precios especiales.',
    ],
    terms: ['lista-precios'],
  },
  '/app/inventario': {
    title: 'Existencias',
    tips: [
      'Elige la sucursal para ver lo que hay en ella.',
      'Pon una existencia mínima a los productos que no deben agotarse: recibirás alertas.',
      'El kardex de un producto muestra cada entrada y salida.',
    ],
    terms: ['stock-minimo', 'kardex'],
  },
  '/app/inventario/movimientos': {
    title: 'Movimientos de inventario',
    tips: [
      'Empieza con un saldo inicial: lo que tienes hoy en el local.',
      'Usa un ajuste para daños, vencimientos o regalos, y un conteo físico para corregir según lo que contaste.',
      'Un traslado mueve mercancía de una sucursal a otra.',
    ],
    terms: ['saldo-inicial', 'costo-promedio'],
  },
  '/app/inventario/kardex': {
    title: 'Kardex',
    tips: [
      'Cada fila es un movimiento: venta, ajuste, traslado o saldo inicial.',
      'La columna de existencia muestra cuánto quedó después de cada movimiento.',
      'Filtra por fechas para revisar un periodo.',
    ],
    terms: ['kardex', 'costo-promedio'],
  },
  '/app/inventario/nuevo': {
    title: 'Documento de inventario',
    tips: [
      'Escanea o busca cada producto y escribe la cantidad.',
      'En el saldo inicial y en las entradas escribe el costo por unidad.',
      'Revisa antes de registrar: un documento registrado no se edita.',
    ],
    terms: ['saldo-inicial', 'costo-promedio'],
  },
  '/app/clientes': {
    title: 'Clientes',
    tips: [
      'Registra a los clientes que te piden factura o tienen precios especiales.',
      'Las ventas sin cliente quedan a nombre de "Consumidor final".',
      'Al escribir el NIT, el dígito de verificación se calcula solo.',
    ],
    terms: ['lista-precios'],
  },
  '/app/proveedores': {
    title: 'Proveedores',
    tips: [
      'Registra a quienes te venden mercancía para tener sus datos a mano.',
      'Al escribir el NIT, el dígito de verificación se calcula solo.',
      'Desactivar un proveedor lo oculta sin borrar su historia.',
    ],
  },
  '/app/sucursales': {
    title: 'Sucursales',
    tips: [
      'Crea una sucursal por cada local donde vendes o guardas mercancía.',
      'Cada sucursal tiene sus propias existencias y cajas.',
      'Desactivar una sucursal no borra sus ventas.',
    ],
  },
  '/app/cajas': {
    title: 'Cajas',
    tips: [
      'Crea una caja por cada punto donde se cobra al mismo tiempo.',
      'Cada caja pertenece a una sucursal y la abre una persona a la vez.',
      'Al cerrar, cada caja tiene su propio arqueo.',
    ],
    terms: ['arqueo'],
  },
  '/app/usuarios': {
    title: 'Usuarios',
    tips: [
      'Al invitar a alguien se genera un enlace: envíaselo para que cree su usuario y su clave.',
      'El rol define qué puede hacer; las sucursales, dónde.',
      'Desactiva a quien ya no trabaja contigo: no podrá entrar, pero su historia se conserva.',
    ],
  },
  '/app/roles': {
    title: 'Roles y permisos',
    tips: [
      'Los roles del sistema (Dueño, Administrador, Cajero…) no se pueden cambiar.',
      'Crea un rol propio si necesitas una combinación distinta, por ejemplo un supervisor.',
      'Los cambios llegan a cada usuario al renovar su sesión (máximo 15 minutos).',
    ],
  },
  '/app/ajustes': {
    title: 'Ajustes del negocio',
    tips: [
      'Si vendes sin inventario exacto, puedes permitir ventas sin existencias.',
      'Indica si tus precios ya incluyen el IVA.',
      'El pie del recibo sale al final de cada tiquete (por ejemplo, horarios o redes sociales).',
    ],
  },
};

/** Ayuda de la pantalla actual, o null si no tiene. */
export function helpForUrl(url: string): HelpTopic | null {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path === '/app') {
    return SCREEN_HELP['/app'] ?? null;
  }
  const match = Object.keys(SCREEN_HELP)
    .filter((route) => route !== '/app' && (path === route || path.startsWith(`${route}/`)))
    .sort((a, b) => b.length - a.length)[0];
  return match ? SCREEN_HELP[match] ?? null : null;
}
