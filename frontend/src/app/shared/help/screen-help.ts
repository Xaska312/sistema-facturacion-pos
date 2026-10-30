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
  /** Sección del manual de uso (/manual#id) que explica la pantalla en detalle. */
  manual?: string;
}

/** Por ruta; se usa la ruta más larga que coincide con la URL ("/app" solo en el inicio exacto). */
export const SCREEN_HELP: Readonly<Record<string, HelpTopic>> = {
  '/app': {
    manual: 'tablero',
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
    manual: 'cerrar-caja',
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
    manual: 'cerrar-caja',
    title: 'Historial de caja',
    tips: [
      'Cada fila es un turno de caja, desde que se abrió hasta que se cerró.',
      'Abre el informe de un turno para ver las ventas por medio de pago, las anulaciones y el efectivo.',
      'Si no ves la diferencia del arqueo es porque tu usuario no supervisa cajas (cierre ciego).',
    ],
    terms: ['arqueo', 'cierre-ciego'],
  },
  '/app/ventas': {
    manual: 'anular-venta',
    title: 'Ventas',
    tips: [
      'Busca por número de venta (POS-12) o por el nombre del cliente.',
      'Desde el detalle puedes reimprimir el tiquete o enviar el recibo por WhatsApp.',
      'Anular una venta devuelve las existencias y el efectivo; se pide un motivo y queda registrada.',
    ],
  },
  '/app/reportes': {
    manual: 'reportes',
    title: 'Reportes',
    tips: [
      'Elige el periodo y la sucursal arriba; cada pestaña muestra una vista del mismo periodo.',
      'Exporta cualquier pestaña a Excel (CSV) con el botón de arriba.',
      'El valor del inventario usa el costo promedio de cada producto.',
    ],
    terms: ['medios-pago', 'costo-promedio'],
  },
  '/app/auditoria': {
    manual: 'auditoria',
    title: 'Auditoría',
    tips: [
      'Cada fila es algo que alguien hizo en el negocio: vender, anular, abrir o cerrar caja, cambiar precios o permisos, entrar al sistema.',
      'Filtra por fechas, usuario o módulo; la búsqueda encuentra nombres, números de venta y códigos dentro de los datos.',
      'En "Ver", lo resaltado es lo que cambió (antes y después).',
      'Los registros no se pueden modificar ni borrar, y exportar la auditoría o un reporte también queda registrado.',
    ],
  },
  '/app/productos': {
    manual: 'crear-producto',
    title: 'Productos',
    tips: [
      'Crea productos uno a uno (solo hacen falta el nombre y el precio) o impórtalos desde una plantilla de Excel.',
      'Deja marcado "Llevar control de existencias" en lo que tienes en bodega; los servicios no lo necesitan.',
      'Un producto puede tener varios códigos de barras y presentaciones (por ejemplo, caja de 24).',
      'Desactivar un producto lo oculta del POS sin borrar su historia.',
    ],
    terms: ['costo-promedio', 'lista-precios'],
  },
  '/app/productos/modelos': {
    manual: 'tallas-colores',
    title: 'Productos con tallas',
    tips: [
      'Un modelo tiene un precio y una variante por cada talla y color; cada variante es un producto con su código.',
      'Al crear el modelo eliges la escala, las tallas y los colores: las variantes y sus códigos se crean solos.',
      'En el modelo, toca una casilla de la cuadrícula para poner el código del proveedor o desactivar esa talla.',
      'Para cargar existencias usa "Por tallas" en el saldo inicial, los ajustes, los traslados o el conteo.',
    ],
  },
  '/app/productos/tallas': {
    manual: 'tallas-colores',
    title: 'Escalas de tallas',
    tips: [
      'Ya vienen las escalas de calzado (Colombia, EU, US, niño) y de ropa; puedes editarlas o crear las tuyas.',
      'La equivalencia es texto libre (p. ej. "EU 39 / US 7") porque cambia según la marca.',
      'Una talla que ya usa algún producto no se puede quitar de la escala.',
    ],
  },
  '/app/mesas': {
    manual: 'mesas',
    title: 'Mesas',
    tips: [
      'Toca una mesa libre para abrir su cuenta; una ocupada para pedir, mover, unir o cobrar.',
      'Lo que pides queda pendiente hasta tocar "Agregar a la cuenta" (o "Enviar a cocina" si tienes cocina).',
      'Para llevar y domicilios se abren con los botones de arriba.',
      'Cobrar abre Vender con los productos de la cuenta; al terminar, la mesa queda libre.',
    ],
  },
  '/app/mesas/configurar': {
    manual: 'configurar-mesas',
    title: 'Configurar mesas',
    tips: [
      'Crea una zona por cada parte del local (Salón, Terraza, Barra).',
      'Con "Agregar mesas" creas varias numeradas de una vez.',
      'Toca una mesa para renombrarla, cambiarle los puestos o la zona.',
    ],
  },
  '/app/comandas': {
    manual: 'comandas',
    title: 'Comandas',
    tips: [
      'Al tocar "Enviar a cocina" en una cuenta, sale una comanda por estación (Cocina, Bar…).',
      'Marca arriba las estaciones que imprime este equipo: con XASKA abierto, las imprime solas.',
      'Reimprimir queda en la auditoría; el término de la carne sale destacado.',
      'Para que Chrome no pregunte antes de imprimir, ábrelo con --kiosk-printing (ver el manual).',
    ],
  },
  '/app/cocina': {
    manual: 'pantalla-cocina',
    title: 'Pantalla de cocina',
    tips: [
      'Las comandas llegan al instante, la más vieja primero; amarilla desde 10 min y roja desde 20.',
      'Toca "Preparando" al empezar y "Lista" al terminar: quien la envió recibe un aviso con sonido.',
      'Toca "Activar sonido" una vez al abrir la pantalla; elige arriba qué estaciones ve esta pantalla.',
      'Si anulan un plato, sale tachado con alarma: no lo prepares.',
    ],
  },
  '/app/comandas/estaciones': {
    manual: 'estaciones',
    title: 'Estaciones de cocina',
    tips: [
      'Cocina es la principal: recibe todo lo que no tenga otra estación.',
      'Crea el Bar y asígnale la categoría Bebidas: las bebidas salen en su propia comanda.',
      'Un producto asignado suelto manda sobre su categoría.',
    ],
  },
  '/app/adiciones': {
    manual: 'adiciones',
    title: 'Adiciones',
    tips: [
      'Crea un grupo una vez (o con una plantilla: Término, Tamaño, Salsas, Sin…) y aplícalo a una categoría o a productos.',
      'Obligatorio: al vender no deja agregar el producto sin elegir; opcional: se puede saltar.',
      'El precio de cada opción se suma al producto; puede ser 0 o negativo (Sin licor).',
      'Al vender, cada producto con adiciones abre sus opciones y una nota (por ejemplo, sin cebolla).',
    ],
  },
  '/app/bascula': {
    manual: 'bascula',
    title: 'Báscula',
    tips: [
      'Configura el formato tal como lo imprime tu báscula: el ejemplo te ayuda a compararlo con una etiqueta real.',
      'Asigna a cada producto que pesas el PLU que tiene en la báscula; su unidad debe admitir decimales (KG, LB…).',
      'En la venta, escanea la etiqueta: entra el producto con su peso (o con la cantidad que da el precio de la etiqueta).',
      'Sin báscula etiquetadora, en el carrito toca la línea y usa "Vende por valor" ($5.000 de queso).',
    ],
  },
  '/app/productos/importar': {
    manual: 'importar-productos',
    title: 'Importar productos',
    tips: [
      'Descarga la plantilla de Excel, llénala (una fila por producto) y guárdala.',
      'Primero revisa: el sistema te dice qué filas tienen errores antes de guardar nada.',
      'Si un SKU ya existe, ese producto se actualiza.',
    ],
  },
  '/app/catalogo': {
    manual: 'catalogo',
    title: 'Ajustes de catálogo',
    tips: [
      'Las categorías agrupan tus productos en el POS y en los reportes.',
      'Los impuestos de Colombia ya vienen creados; usa el que corresponda a cada producto.',
      'Las listas de precios sirven para clientes con precios especiales.',
    ],
    terms: ['lista-precios'],
  },
  '/app/inventario': {
    manual: 'existencias',
    title: 'Existencias',
    tips: [
      'Elige la sucursal para ver lo que hay en ella.',
      'Pon una existencia mínima a los productos que no deben agotarse: recibirás alertas.',
      'El kardex de un producto muestra cada entrada y salida.',
    ],
    terms: ['stock-minimo', 'kardex'],
  },
  '/app/inventario/movimientos': {
    manual: 'ajustes-traslados',
    title: 'Movimientos de inventario',
    tips: [
      'Empieza con un saldo inicial: lo que tienes hoy en el local.',
      'Usa un ajuste para daños, vencimientos o regalos, y un conteo físico para corregir según lo que contaste.',
      'Un traslado mueve mercancía de una sucursal a otra.',
    ],
    terms: ['saldo-inicial', 'costo-promedio'],
  },
  '/app/inventario/kardex': {
    manual: 'existencias',
    title: 'Kardex',
    tips: [
      'Cada fila es un movimiento: venta, ajuste, traslado o saldo inicial.',
      'La columna de existencia muestra cuánto quedó después de cada movimiento.',
      'Filtra por fechas para revisar un periodo.',
    ],
    terms: ['kardex', 'costo-promedio'],
  },
  '/app/inventario/nuevo': {
    manual: 'saldo-inicial',
    title: 'Documento de inventario',
    tips: [
      'Escanea o busca cada producto y escribe la cantidad.',
      'En el saldo inicial y en las entradas escribe el costo por unidad.',
      'Revisa antes de registrar: un documento registrado no se edita.',
    ],
    terms: ['saldo-inicial', 'costo-promedio'],
  },
  '/app/fiados': {
    manual: 'fiado',
    title: 'Fiados',
    tips: [
      'Para fiarle a un cliente, ponle un cupo en Clientes; al cobrar aparece "Fiado" con lo que tiene disponible.',
      'Toca "Abonar" cuando venga a pagar: en efectivo, el dinero entra a tu caja abierta.',
      'La antigüedad muestra desde cuándo debe lo que queda: los abonos pagan primero lo más viejo.',
      '"Recordar" abre WhatsApp con un mensaje amable y el saldo listo para enviar.',
    ],
  },
  '/app/pedidos': {
    manual: 'pedidos',
    title: 'Pedidos por encargo',
    tips: [
      'Crea el pedido con el cliente, la fecha de entrega y lo que pidió (por cantidad o por medidas en m²).',
      'Los anticipos en efectivo entran hoy a tu caja abierta; al entregar se descuentan solos.',
      '"Entregar" registra una venta con lo que entregas: puede ser todo o una parte, y pagar con varios medios (por ejemplo, efectivo y fiado).',
      'Comparte el comprobante por WhatsApp, en PDF (hoja carta con tu logo) o imprímelo.',
    ],
  },
  '/app/cotizaciones': {
    manual: 'cotizaciones',
    title: 'Cotizaciones',
    tips: [
      'Cotiza a un cliente registrado o a alguien que aún no lo está (solo nombre y teléfono).',
      'Cada línea puede llevar descuento; la vigencia y las condiciones por defecto se cambian en Ajustes.',
      'Compártela en PDF o por WhatsApp. Si la aceptan, conviértela en pedido o en venta con los mismos precios.',
      'Una vencida se renueva editando la fecha, o se duplica para hacer una nueva.',
    ],
  },
  '/app/clientes': {
    manual: 'clientes',
    title: 'Clientes',
    tips: [
      'Registra a los clientes que te piden factura o tienen precios especiales.',
      'Las ventas sin cliente quedan a nombre de "Consumidor final".',
      'Al escribir el NIT, el dígito de verificación se calcula solo.',
    ],
    terms: ['lista-precios'],
  },
  '/app/proveedores': {
    manual: 'clientes',
    title: 'Proveedores',
    tips: [
      'Registra a quienes te venden mercancía para tener sus datos a mano.',
      'Al escribir el NIT, el dígito de verificación se calcula solo.',
      'Desactivar un proveedor lo oculta sin borrar su historia.',
    ],
  },
  '/app/sucursales': {
    manual: 'sucursales-cajas',
    title: 'Sucursales',
    tips: [
      'Crea una sucursal por cada local donde vendes o guardas mercancía.',
      'Cada sucursal tiene sus propias existencias y cajas.',
      'Desactivar una sucursal no borra sus ventas.',
    ],
  },
  '/app/cajas': {
    manual: 'sucursales-cajas',
    title: 'Cajas',
    tips: [
      'Crea una caja por cada punto donde se cobra al mismo tiempo.',
      'Cada caja pertenece a una sucursal y la abre una persona a la vez.',
      'Al cerrar, cada caja tiene su propio arqueo.',
    ],
    terms: ['arqueo'],
  },
  '/app/usuarios': {
    manual: 'invitar',
    title: 'Usuarios',
    tips: [
      'Al invitar a alguien le llega un correo con el enlace; también puedes copiarlo y enviarlo por WhatsApp.',
      'El rol define qué puede hacer; las sucursales, dónde.',
      'Desactiva a quien ya no trabaja contigo: no podrá entrar, pero su historia se conserva.',
    ],
  },
  '/app/roles': {
    manual: 'roles',
    title: 'Roles y permisos',
    tips: [
      'Los roles del sistema (Dueño, Administrador, Cajero…) no se pueden cambiar.',
      'Crea un rol propio si necesitas una combinación distinta, por ejemplo un supervisor.',
      'Los cambios llegan a cada usuario al renovar su sesión (máximo 15 minutos).',
    ],
  },
  '/app/ajustes': {
    manual: 'ajustes',
    title: 'Ajustes del negocio',
    tips: [
      'El tipo de negocio y sus módulos deciden lo que ves en el dock y en el inicio; solo el dueño los cambia.',
      'Indica si tus precios ya incluyen el IVA y si se puede vender sin existencias.',
      'El pie del recibo sale al final de cada tiquete (por ejemplo, horarios o redes sociales).',
      'Si eres el dueño, al final puedes eliminar el negocio: queda suspendido y sus datos se conservan.',
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
