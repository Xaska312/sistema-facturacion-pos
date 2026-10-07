import { GLOSSARY } from '../../shared/help/glossary';

/**
 * Manual de uso para los clientes (página pública /manual). Texto en español sencillo, en segunda persona, con los
 * mismos nombres de botones y pantallas que ve el usuario. Cada sección tiene un id estable: se usa en los enlaces
 * que se comparten (/manual#cobrar) y desde la ayuda de cada pantalla.
 */
export interface ManualSection {
  id: string;
  title: string;
  /** Una o dos frases: qué es y para qué sirve. */
  summary: string;
  /** Pasos en orden. */
  steps?: readonly string[];
  /** Consejos y detalles. */
  tips?: readonly string[];
  /** Tabla de dos columnas (atajos, roles…). */
  table?: { headers: readonly [string, string]; rows: readonly (readonly [string, string])[] };
  /** Quién puede hacerlo (rol o permiso en palabras). */
  who?: string;
}

export interface ManualChapter {
  id: string;
  title: string;
  icon: string;
  sections: readonly ManualSection[];
}

export const MANUAL: readonly ManualChapter[] = [
  {
    id: 'empezar',
    title: 'Primeros pasos',
    icon: 'pi pi-flag',
    sections: [
      {
        id: 'crear-cuenta',
        title: 'Crear tu cuenta',
        summary: 'Tu cuenta es personal: con ella entras a uno o varios negocios. Cada persona del equipo tiene la suya.',
        steps: [
          'Entra a la aplicación y toca "Regístrate".',
          'Escribe tu nombre, tu correo, tu celular (opcional) y una contraseña de al menos 10 caracteres con letras y números.',
          'Te llega un correo "Confirma tu correo". Ábrelo y toca "Confirmar mi correo".',
          'Inicia sesión con tu correo y tu contraseña.',
        ],
        tips: [
          'Si el correo no llega en unos minutos, revisa la carpeta de spam o de promociones.',
          'Puedes pedir otro correo con "Reenviar correo" en la pantalla de tus negocios (uno por minuto). El enlace vence en 24 horas.',
          'Si te invitaron a un negocio, regístrate con el mismo correo al que llegó la invitación.',
        ],
      },
      {
        id: 'crear-negocio',
        title: 'Crear tu negocio',
        summary: 'Cada negocio tiene sus propios productos, ventas, cajas y usuarios, separados de los de otros negocios.',
        steps: [
          'Confirma tu correo (es necesario para crear un negocio).',
          'En "Elige el negocio con el que vas a trabajar", toca "+ Crear un negocio".',
          'Escribe el nombre comercial (el que ven tus clientes) y la razón social.',
          'Revisa el identificador que se propone: solo minúsculas, números y "_". No se puede cambiar después.',
          'Toca "Continuar" y luego "Crear negocio". En unos segundos entras al negocio.',
        ],
        tips: [
          'El negocio nace con una sucursal principal, una caja, los impuestos de Colombia y los roles por defecto.',
          'Puedes tener varios negocios con la misma cuenta y cambiar entre ellos desde el menú de usuario.',
        ],
        who: 'Cualquier cuenta con el correo confirmado. Quien crea el negocio queda como Propietario.',
      },
      {
        id: 'primeros-pasos',
        title: 'La lista de primeros pasos',
        summary: 'Al entrar por primera vez, el inicio muestra una lista que te lleva paso a paso hasta tu primera venta.',
        steps: [
          'Revisa tu sucursal: ponle la dirección o crea una por cada local.',
          'Crea las categorías de tus productos (bebidas, aseo…).',
          'Carga tus productos, uno a uno o desde un archivo de Excel.',
          'Registra las existencias iniciales (lo que tienes hoy en el local).',
          'Invita a tu equipo (opcional si trabajas solo).',
          'Abre la caja y haz tu primera venta.',
        ],
        tips: [
          'Cada paso se marca solo cuando lo completas.',
          'En cada pantalla, el botón de ayuda (?) explica qué hacer y algunas tienen un recorrido guiado.',
        ],
      },
    ],
  },
  {
    id: 'vender',
    title: 'Vender',
    icon: 'pi pi-shopping-cart',
    sections: [
      {
        id: 'abrir-caja',
        title: 'Abrir la caja',
        summary: 'Para vender necesitas tener tu caja abierta. La base es el efectivo que hay en el cajón al empezar.',
        steps: [
          'Toca "Vender" en el menú (o "Mi caja").',
          'Si hay más de una caja libre, elige la tuya. Escribe la base de efectivo: lo que hay en el cajón para dar cambio.',
          'Toca "Abrir caja".',
        ],
        tips: [
          'Cada persona abre su propia caja y solo puede tener una abierta a la vez.',
          'Una caja la usa una persona a la vez; si tienes dos puntos de cobro, crea dos cajas en Configuración → Cajas.',
        ],
        who: 'Propietario, Administrador y Cajero.',
      },
      {
        id: 'registrar-venta',
        title: 'Agregar productos a la venta',
        summary: 'La pantalla de venta funciona con lector de código de barras, con teclado o tocando los productos (ideal en tablet).',
        steps: [
          'Pasa el lector por el código de barras, o escribe el código o el SKU y pulsa Enter.',
          'Para varias unidades escribe la cantidad, un asterisco y el código: 3*7701234567890.',
          'Si no tienes el código a mano, pulsa F2 (o "Buscar") y escribe parte del nombre.',
          'También puedes elegir una categoría y tocar el producto.',
        ],
        tips: [
          'Cambia la cantidad de una línea con − y +. Tócala para escribir la cantidad o, si tu rol lo permite, un descuento en porcentaje (el máximo se define en Ajustes).',
          'Si quitas una línea por error, toca "Deshacer".',
          'Con la estrella dejas un producto en Favoritos para encontrarlo rápido.',
          'Si un producto no tiene existencias suficientes, el sistema te avisa. Solo deja vender sin existencias si lo permites en Ajustes.',
        ],
      },
      {
        id: 'cobrar',
        title: 'Cobrar',
        summary: 'Puedes recibir efectivo, tarjeta o transferencia (Nequi, Daviplata, bancos), y combinar varios en la misma venta.',
        steps: [
          'Si la venta es para un cliente registrado, elígelo; si no, queda como "Consumidor final".',
          'Toca "Cobrar" o pulsa F4.',
          'Elige el medio de pago. En efectivo, toca el billete que te entregaron o escribe el valor: el cambio se ve en grande.',
          'Para pagar una parte en efectivo y otra con tarjeta, agrega los dos medios con su valor.',
          'En tarjeta y transferencia escribe la referencia o el número de aprobación.',
          'Toca "Registrar venta" o pulsa Enter.',
        ],
        tips: [
          'Si el cliente tiene una lista de precios (por ejemplo, mayorista), al elegirlo la venta usa sus precios.',
          'Solo el efectivo entra al cajón; tarjeta y transferencia quedan registradas para el cuadre.',
          'Después de registrar, pulsa Enter o toca "Nueva venta" para seguir.',
        ],
      },
      {
        id: 'tiquete',
        title: 'Imprimir el tiquete',
        summary: 'Al registrar la venta puedes imprimir el tiquete en impresora térmica de 58 u 80 mm o en cualquier impresora.',
        steps: [
          'Al terminar la venta toca "Imprimir tiquete".',
          'La primera vez elige el ancho del papel (80 mm o 58 mm); el navegador lo recuerda en ese equipo.',
          'Para reimprimir una venta anterior, búscala en Ventas, ábrela y toca "Reimprimir".',
        ],
        tips: [
          'El texto del pie del tiquete (horarios, redes sociales…) se cambia en Configuración → Ajustes.',
          'El tiquete es un comprobante de venta; por ahora el sistema no emite factura electrónica de la DIAN.',
        ],
      },
      {
        id: 'anular-venta',
        title: 'Anular una venta',
        summary: 'Anular no borra la venta: la marca como anulada, devuelve las existencias y el efectivo, y queda registrada con el motivo.',
        steps: [
          'Ve a Ventas y busca la venta por su número (POS-12) o por el cliente.',
          'Ábrela, toca "Anular" y escribe el motivo.',
        ],
        tips: [
          'Si la caja de esa venta ya se cerró, el efectivo sale de la caja que tenga abierta quien anula.',
          'Las anulaciones aparecen en el informe de la caja y en la auditoría.',
        ],
        who: 'Quien tenga el permiso de anular ventas (por defecto, Propietario y Administrador).',
      },
      {
        id: 'atajos',
        title: 'Atajos de teclado',
        summary: 'Con teclado y lector puedes vender sin tocar el mouse.',
        table: {
          headers: ['Tecla', 'Qué hace'],
          rows: [
            ['Enter', 'Agrega el código escrito; en el cobro registra la venta; después, empieza una nueva'],
            ['F2', 'Buscar un producto por nombre'],
            ['F4', 'Cobrar'],
            ['Esc', 'Cierra lo que esté abierto; si no hay nada abierto, cancela la venta'],
            ['?', 'Ver los atajos y repetir el recorrido guiado'],
            ['3*código', 'Agrega 3 unidades de ese código'],
          ],
        },
      },
    ],
  },
  {
    id: 'caja',
    title: 'Caja',
    icon: 'pi pi-wallet',
    sections: [
      {
        id: 'movimientos-caja',
        title: 'Ingresos, egresos y retiros',
        summary: 'Registra el efectivo que entra o sale del cajón sin ser una venta, para que el cierre cuadre.',
        table: {
          headers: ['Movimiento', 'Cuándo usarlo'],
          rows: [
            ['Ingreso', 'Entra efectivo que no es una venta (por ejemplo, te dan sencillo).'],
            ['Egreso', 'Pagas algo con el efectivo de la caja (un domicilio, un arreglo).'],
            ['Retiro', 'Sacas dinero para guardarlo o consignarlo. No es un gasto.'],
          ],
        },
        steps: ['En "Mi caja", toca "Ingreso", "Egreso" o "Retiro", escribe el valor y el motivo, y guarda.'],
      },
      {
        id: 'cerrar-caja',
        title: 'Cerrar la caja (arqueo)',
        summary: 'Al terminar el turno cuentas el efectivo del cajón. El sistema lo compara con lo que debería haber.',
        steps: [
          'En "Mi caja" toca "Cerrar caja".',
          'Cuenta billetes y monedas y escribe el total.',
          'Confirma. Se guarda el informe del turno con las ventas por medio de pago, los movimientos y las anulaciones.',
        ],
        tips: [
          'El cierre es "ciego": quien cierra no ve cuánto debería haber, así el conteo es honesto. La diferencia la ve quien supervisa.',
          '"Informe parcial" muestra cómo va el turno sin cerrarlo.',
          'En "Historial de caja" están todos los turnos con su informe.',
        ],
      },
    ],
  },
  {
    id: 'productos',
    title: 'Productos e inventario',
    icon: 'pi pi-box',
    sections: [
      {
        id: 'crear-producto',
        title: 'Crear un producto',
        summary: 'Cada producto tiene un SKU (tu código interno), uno o varios códigos de barras, precio, impuesto y categoría.',
        steps: [
          'Ve a Productos y toca "Nuevo producto".',
          'Escribe el nombre, el SKU, la categoría, la unidad, el impuesto y el precio de venta.',
          'Agrega el código de barras del empaque. Si no tiene, toca "Generar código interno".',
          'Marca "controla inventario" en lo que tienes en bodega. Los servicios no lo necesitan.',
          'Guarda.',
        ],
        tips: [
          'Las presentaciones sirven para vender por caja o paquete (por ejemplo, caja de 24) con su propio código y precio.',
          'En Ajustes indica si tus precios ya incluyen el IVA ("Los precios incluyen impuestos").',
          'Desactivar un producto lo oculta del punto de venta sin borrar su historia.',
        ],
        who: 'Propietario, Administrador y Bodeguero.',
      },
      {
        id: 'importar-productos',
        title: 'Importar productos desde Excel',
        summary: 'Carga muchos productos de una vez con un archivo CSV que puedes llenar en Excel.',
        steps: [
          'En Productos toca "Importar CSV" y luego "Descargar plantilla".',
          'Llénala en Excel (una fila por producto) y guárdala como CSV.',
          'Súbela y toca "Validar": el sistema te muestra qué filas tienen errores antes de guardar nada.',
          'Corrige lo que falte y confirma la importación.',
        ],
        tips: ['Si un SKU ya existe, ese producto se actualiza con los datos del archivo.'],
      },
      {
        id: 'catalogo',
        title: 'Categorías, impuestos y listas de precios',
        summary: 'En Ajustes de catálogo organizas tus productos y defines precios especiales.',
        tips: [
          'Las categorías agrupan los productos en el punto de venta y en los reportes; pueden tener subcategorías.',
          'Los impuestos de Colombia (IVA 19 %, 5 %, exento y excluido) ya vienen creados.',
          'Las listas de precios sirven para clientes con precios especiales (por ejemplo, mayoristas). Se asignan al cliente.',
        ],
      },
      {
        id: 'saldo-inicial',
        title: 'Registrar las existencias iniciales',
        summary: 'Antes de vender con inventario, registra lo que tienes hoy en el local y lo que te costó.',
        steps: [
          'Ve a Inventario → Movimientos y toca "Saldo inicial".',
          'Elige la sucursal.',
          'Escanea o busca cada producto y escribe la cantidad y el costo por unidad.',
          'Revisa y toca "Registrar". Un documento registrado no se edita.',
        ],
        tips: ['El saldo inicial se registra una sola vez por producto y sucursal; después se usan ajustes o conteos.'],
        who: 'Propietario, Administrador y Bodeguero.',
      },
      {
        id: 'ajustes-traslados',
        title: 'Ajustes, conteos y traslados',
        summary: 'Corrige el inventario o mueve mercancía entre sucursales con un documento que queda registrado.',
        table: {
          headers: ['Documento', 'Para qué'],
          rows: [
            ['Ajuste', 'Entradas o salidas por daños, vencimientos, regalos o compras.'],
            ['Conteo físico', 'Cuentas lo que hay y el sistema corrige la diferencia.'],
            ['Traslado', 'Mueve mercancía de una sucursal a otra.'],
          ],
        },
      },
      {
        id: 'existencias',
        title: 'Existencias, alertas y kardex',
        summary: 'Consulta cuánto hay de cada producto en cada sucursal y recibe alertas antes de que se agote.',
        tips: [
          'En Existencias elige la sucursal para ver lo que hay en ella.',
          'Pon una existencia mínima a los productos que no deben agotarse: aparecen en las alertas del inicio.',
          'El kardex de un producto muestra cada entrada y salida, con la existencia y el costo después de cada una.',
          'El costo se calcula como costo promedio y con él se calculan la utilidad y el valor del inventario.',
        ],
      },
    ],
  },
  {
    id: 'terceros',
    title: 'Clientes y proveedores',
    icon: 'pi pi-users',
    sections: [
      {
        id: 'clientes',
        title: 'Clientes y proveedores',
        summary: 'Registra a los clientes que te piden sus datos en la venta o tienen precios especiales, y a tus proveedores.',
        steps: [
          'Ve a Clientes (o Proveedores) y toca "Nuevo cliente" (o "Nuevo proveedor").',
          'Elige persona natural o jurídica, el tipo y número de documento, el nombre o la razón social y el municipio.',
          'Guarda.',
        ],
        tips: [
          'Con NIT, el dígito de verificación se calcula solo.',
          'Las ventas sin cliente quedan a nombre de "Consumidor final".',
          'Desactivar un cliente o proveedor lo oculta sin borrar su historia.',
        ],
      },
    ],
  },
  {
    id: 'equipo',
    title: 'Equipo y permisos',
    icon: 'pi pi-user-plus',
    sections: [
      {
        id: 'invitar',
        title: 'Invitar a tu equipo',
        summary: 'Cada persona entra con su propio usuario. Así sabes quién vendió, quién abrió la caja y quién hizo cada cambio.',
        steps: [
          'Ve a Configuración → Usuarios y toca "Invitar usuario".',
          'Escribe el correo de la persona, elige su rol y las sucursales donde trabaja.',
          'Toca "Enviar invitación". Le llega un correo con el enlace; también puedes copiar el enlace y enviárselo por WhatsApp.',
          'La persona abre el enlace, crea su cuenta con ese mismo correo y acepta la invitación.',
        ],
        tips: [
          'La invitación vence en 7 días. En "Invitaciones pendientes" puedes reenviarla (el enlace anterior deja de servir) o revocarla.',
          'Desactiva a quien ya no trabaja contigo: no podrá entrar, pero su historia se conserva.',
        ],
        who: 'Propietario y Administrador.',
      },
      {
        id: 'roles',
        title: 'Roles',
        summary: 'El rol define qué puede hacer cada persona; las sucursales, dónde. Estos son los roles que trae el sistema:',
        table: {
          headers: ['Rol', 'Qué puede hacer'],
          rows: [
            ['Propietario', 'Todo. Es quien creó el negocio y no se puede quitar.'],
            ['Administrador', 'Todo lo del negocio: productos, inventario, ventas, caja, usuarios, reportes y ajustes.'],
            ['Cajero', 'Abre y cierra su caja, vende, registra clientes y consulta productos y existencias.'],
            ['Vendedor', 'Consulta productos, existencias y ventas. Para cobrar necesita un rol con caja (como Cajero).'],
            ['Bodeguero', 'Gestiona productos e inventario: saldos, ajustes, conteos y traslados.'],
            ['Contador', 'Consulta ventas, cajas (con la diferencia del arqueo), reportes y auditoría. No modifica nada.'],
          ],
        },
        tips: [
          'En Roles y permisos puedes crear un rol propio, por ejemplo un supervisor de caja.',
          'Los cambios de permisos le llegan a cada persona en máximo 15 minutos, o al volver a entrar.',
        ],
      },
      {
        id: 'sucursales-cajas',
        title: 'Sucursales y cajas',
        summary: 'Una sucursal es cada local donde vendes o guardas mercancía; cada una tiene sus existencias y sus cajas.',
        tips: [
          'Crea una caja por cada punto donde se cobra al mismo tiempo.',
          'Desactivar una sucursal o una caja no borra sus ventas.',
        ],
      },
    ],
  },
  {
    id: 'control',
    title: 'Reportes y control',
    icon: 'pi pi-chart-bar',
    sections: [
      {
        id: 'tablero',
        title: 'Tablero del inicio',
        summary: 'Ventas, utilidad, medios de pago y productos más vendidos del periodo, con alertas de existencias.',
        tips: [
          'Cambia el periodo (hoy, 7 días, mes…) y la sucursal arriba.',
          'Quien no ve reportes (por ejemplo, un cajero) ve en el inicio sus propias ventas del día.',
        ],
      },
      {
        id: 'reportes',
        title: 'Reportes y exportar a Excel',
        summary: 'Ventas por día, sucursal, vendedor y medio de pago; utilidad por producto y categoría; impuestos y valor del inventario.',
        tips: [
          'Elige el periodo y la sucursal; cada pestaña muestra una vista del mismo periodo.',
          'Con "Exportar a Excel (CSV)" descargas la pestaña en un archivo que abre en Excel.',
        ],
        who: 'Propietario, Administrador y Contador.',
      },
      {
        id: 'auditoria',
        title: 'Auditoría: quién hizo qué',
        summary: 'Cada acción importante queda registrada: ventas, anulaciones, cajas, cambios de precios, permisos y entradas al sistema.',
        tips: [
          'Filtra por fechas, usuario o módulo, o busca un número de venta o un código.',
          'En "Ver", lo resaltado es lo que cambió (antes y después).',
          'Los registros no se pueden modificar ni borrar.',
        ],
        who: 'Propietario, Administrador y Contador.',
      },
    ],
  },
  {
    id: 'cuenta',
    title: 'Tu cuenta y tu negocio',
    icon: 'pi pi-lock',
    sections: [
      {
        id: 'olvide-contrasena',
        title: 'Olvidé mi contraseña',
        summary: 'Puedes crear una contraseña nueva con un enlace que te llega al correo.',
        steps: [
          'En la pantalla de inicio de sesión toca "¿Olvidaste tu contraseña?".',
          'Escribe tu correo y toca "Enviar enlace".',
          'Abre el correo "Restablece tu contraseña" y toca "Crear una contraseña nueva" (vence en 1 hora).',
          'Escribe la contraseña nueva dos veces y guarda. Luego inicia sesión con ella.',
        ],
        tips: [
          'Por seguridad se cierran las sesiones abiertas en todos tus equipos y te llega un aviso de que la contraseña cambió.',
          'Si recibes ese aviso y no fuiste tú, cambia la contraseña de inmediato y avisa a soporte.',
        ],
      },
      {
        id: 'seguridad',
        title: 'Seguridad de tu cuenta',
        summary: 'Algunas reglas protegen tu negocio aunque alguien conozca tu correo.',
        tips: [
          'Después de 5 intentos fallidos, la cuenta se bloquea 15 minutos. Si no recuerdas la contraseña, restablécela.',
          'Cada persona debe usar su propio usuario: no compartas tu contraseña con el equipo.',
          'Al terminar en un equipo compartido, toca "Salir" en el menú de usuario.',
        ],
      },
      {
        id: 'ajustes',
        title: 'Ajustes del negocio',
        summary: 'Datos del negocio y reglas de venta.',
        tips: [
          'Permitir vender sin existencias: útil si aún no tienes el inventario exacto.',
          'Los precios incluyen impuestos: márcalo si el precio de venta que escribes ya trae el IVA.',
          'Pie del recibo: el texto que sale al final de cada tiquete.',
        ],
        who: 'Para cambiarlos: Propietario y Administrador.',
      },
      {
        id: 'eliminar-negocio',
        title: 'Eliminar o suspender el negocio',
        summary: 'Si dejas de usar el sistema, el propietario puede eliminar el negocio desde Ajustes. Los datos no se borran.',
        steps: [
          'Ve a Configuración → Ajustes y, al final, toca "Eliminar negocio…".',
          'Escribe el nombre del negocio y tu contraseña, y confirma.',
        ],
        tips: [
          'El negocio queda suspendido: nadie puede entrar y se cierran las sesiones de tu equipo. Te llega un correo de confirmación.',
          'Para recuperarlo, comunícate con soporte.',
          'Si soporte suspende tu negocio (por ejemplo, por un pago pendiente), te llega un correo con el motivo y en "Elegir negocio" lo verás como suspendido.',
        ],
        who: 'Solo el propietario.',
      },
    ],
  },
  {
    id: 'preguntas',
    title: 'Preguntas frecuentes',
    icon: 'pi pi-question-circle',
    sections: [
      {
        id: 'no-llega-correo',
        title: 'No me llega el correo',
        summary: 'Revisa spam y promociones, y que el correo esté bien escrito.',
        tips: [
          'Para confirmar la cuenta: "Reenviar correo" en la pantalla de tus negocios.',
          'Para una invitación: pide que te la reenvíen, o que te compartan el enlace por WhatsApp.',
          'Para la contraseña: pide otro enlace en "¿Olvidaste tu contraseña?" (uno por minuto).',
        ],
      },
      {
        id: 'equipos',
        title: '¿En qué equipos funciona?',
        summary: 'En el navegador de un computador, tablet o celular (Chrome, Edge, Safari o Firefox actualizados). No hay que instalar nada.',
        tips: [
          'La pantalla de venta está pensada para computador con lector o para tablet horizontal.',
          'Los lectores de código de barras USB funcionan como un teclado: no necesitan configuración.',
          'Se necesita conexión a internet para vender.',
        ],
      },
      {
        id: 'lector',
        title: 'El lector no agrega el producto',
        summary: 'Casi siempre es que el código no está registrado en el producto.',
        tips: [
          'Verifica que el cursor esté en el campo "Código de barras o SKU".',
          'Busca el producto con F2 y revisa que tenga ese código de barras; si no, agrégalo en Productos.',
          'Prueba el lector en un bloc de notas: debe escribir el código y pasar de línea (Enter).',
        ],
      },
      {
        id: 'datos-seguros',
        title: '¿Mis datos están seguros?',
        summary: 'Cada negocio tiene sus datos separados de los demás, la conexión va cifrada (https) y se hacen copias de seguridad diarias cifradas.',
        tips: [
          'Solo las personas que invitas entran a tu negocio, con los permisos de su rol.',
          'Las ventas, movimientos de caja e inventario y la auditoría no se pueden borrar ni modificar.',
        ],
      },
    ],
  },
];

/** Ids de capítulos y secciones (para enlazar desde la ayuda de cada pantalla). */
export const MANUAL_SECTION_IDS: ReadonlySet<string> = new Set(
  MANUAL.flatMap((chapter) => [chapter.id, ...chapter.sections.map((section) => section.id)]),
);

/** Glosario del manual: los mismos términos que explica la ayuda de cada pantalla. */
export const MANUAL_GLOSSARY = Object.values(GLOSSARY)
  .map((entry) => ({ title: entry.title, text: entry.text }))
  .sort((a, b) => a.title.localeCompare(b.title, 'es'));

/** Texto de una sección para buscar (sin tildes ni mayúsculas). */
function sectionText(chapter: ManualChapter, section: ManualSection): string {
  return [
    chapter.title,
    section.title,
    section.summary,
    section.who ?? '',
    ...(section.steps ?? []),
    ...(section.tips ?? []),
    ...(section.table?.rows.flat() ?? []),
  ].join(' ');
}

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es-CO').trim();
}

/** Capítulos con solo las secciones que contienen todas las palabras buscadas (vacío = todo el manual). */
export function filterManual(query: string, manual: readonly ManualChapter[] = MANUAL): ManualChapter[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [...manual];
  }
  return manual
    .map((chapter) => ({
      ...chapter,
      sections: chapter.sections.filter((section) => {
        const text = normalize(sectionText(chapter, section));
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((chapter) => chapter.sections.length > 0);
}
