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
          'En "Elige el negocio con el que vas a trabajar", toca "Crear un negocio".',
          'Escribe el nombre comercial (el que ven tus clientes) y la razón social.',
          'Revisa el identificador que se propone: solo minúsculas, números y "_". No se puede cambiar después.',
          'Elige el tipo de negocio: Comercio o Servicios (Restaurante y Farmacia llegan pronto).',
          'Toca "Continuar" y luego "Crear negocio". En unos segundos entras al negocio.',
        ],
        tips: [
          'El negocio nace con una sucursal principal, una caja, los impuestos de Colombia y los roles por defecto.',
          'Puedes tener varios negocios con la misma cuenta y cambiar entre ellos desde el menú de usuario.',
        ],
        who: 'Cualquier cuenta con el correo confirmado. Quien crea el negocio queda como Propietario.',
      },
      {
        id: 'tipo-y-modulos',
        title: 'Tipo de negocio y módulos',
        summary: 'El tipo de negocio decide lo que ves en el dock y en el inicio. Los módulos (fiados, pedidos, '
          + 'cotizaciones, tallas y colores, báscula) se prenden o apagan según lo que uses.',
        steps: [
          'Entra a Ajustes y busca "Tipo de negocio y módulos".',
          'Toca el tipo de tu negocio: al cambiarlo se proponen sus módulos.',
          'Marca los módulos que usas y desmarca los que no.',
          'Toca "Guardar tipo y módulos". Tú lo ves de una vez; tus empleados, en unos minutos.',
        ],
        tips: [
          'Apagar un módulo no borra nada: sale de las pantallas y vuelve con todos sus datos al prenderlo.',
          'Con Fiados apagado no se fía ni se reciben abonos; préndelo para cobrar lo que te deben.',
          'Vender, caja, ventas, productos, inventario, clientes, proveedores y reportes están siempre.',
        ],
        who: 'Solo el dueño del negocio. Los demás lo ven en Ajustes.',
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
      {
        id: 'moverse',
        title: 'Moverse por la aplicación',
        summary: 'Abajo de la pantalla está el dock con los módulos del día a día; "Todo" reúne los demás.',
        steps: [
          'Toca un ícono del dock para ir a Inicio, Vender, Mi caja, Ventas, Fiados, Pedidos o Productos (los que tu rol permita).',
          'Toca "Todo" (o presiona Ctrl + K) para ver todos los módulos agrupados y buscar uno por su nombre.',
          'En "Todo", escribe parte del nombre y presiona Enter para abrir el primero que coincide.',
        ],
        tips: [
          'El logo de XASKA arriba a la izquierda siempre te lleva al inicio.',
          'Los íconos toman el color de tu negocio (se cambia en Ajustes → Marca).',
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
        summary: 'Para vender necesitas una caja abierta: la tuya o una caja compartida que ya abrió otra persona. La base es el efectivo que hay en el cajón al empezar.',
        steps: [
          'Toca "Vender" en el dock de abajo o en el inicio (o "Mi caja").',
          'Si alguien ya abrió una caja compartida, toca "Vender en …" y listo: vendes en esa caja hasta que se cierre.',
          'Si no, elige la caja (si hay más de una libre) y escribe la base de efectivo: lo que hay en el cajón para dar cambio.',
          'Toca "Abrir caja".',
        ],
        tips: [
          'Caja compartida: una persona la abre (por ejemplo, el dueño en la mañana) y los demás de la sucursal venden en ella. Solo quien la abrió o un administrador la cierra y registra retiros; los demás pueden registrar ingresos y egresos.',
          'Caja personal: cada persona abre y cierra la suya. Se elige en Configuración → Cajas → Editar ("Compartida").',
          'La caja que trae el negocio (CAJA-1) viene compartida. Si tienes dos cajones con dos cajeros, crea otra caja personal para cada uno.',
          'Cada venta queda a nombre de quien la hizo, aunque la caja sea compartida (Reportes → por vendedor).',
        ],
        who: 'Propietario, Administrador, Cajero y Vendedor.',
      },
      {
        id: 'registrar-venta',
        title: 'Agregar productos a la venta',
        summary: 'La pantalla de venta funciona con lector de código de barras, con teclado o tocando los productos (ideal en tablet y celular).',
        steps: [
          'Pasa el lector por el código de barras, o escribe el código o el SKU y pulsa Enter.',
          'Para varias unidades escribe la cantidad, un asterisco y el código: 3*7701234567890.',
          'Si no tienes el código a mano, pulsa F2 (o "Buscar") y escribe parte del nombre. En el celular toca el campo "Buscar producto por nombre o código" que está arriba.',
          'También puedes elegir una categoría y tocar el producto.',
        ],
        tips: [
          'Cambia la cantidad de una línea con − y +. Tócala para escribir la cantidad o, si tu rol lo permite, un descuento en porcentaje (el máximo se define en Ajustes).',
          'Si quitas una línea por error, toca "Deshacer".',
          'Con la estrella dejas un producto en Favoritos para encontrarlo rápido.',
          'Si un producto no tiene existencias suficientes, el sistema te avisa. Solo deja vender sin existencias si lo permites en Ajustes.',
          'En el celular la venta queda debajo de los productos: abajo siempre ves el total, "Ver venta" y "Cobrar".',
        ],
      },
      {
        id: 'pausar-venta',
        title: 'Pausar una venta y atender a otro cliente',
        summary: 'Si un cliente se demora (busca la plata, va por otro producto, le estás registrando los datos), deja su venta en espera y sigue vendiendo.',
        steps: [
          'Con productos en la venta, toca "Pausar venta" (debajo de Cobrar).',
          'Escribe un nombre para reconocerla (por ejemplo, "Señora de la gorra") y toca "Pausar venta".',
          'Atiende al siguiente cliente normalmente.',
          'Para seguir con la venta pausada toca "En espera" (junto al campo del código) y luego "Retomar".',
        ],
        tips: [
          'Si al retomar tenías otra venta abierta, esa también queda en espera: no se pierde nada.',
          'Al retomar, los precios se actualizan a los vigentes.',
          'Las ventas en espera se guardan en ese equipo y para tu usuario durante 7 días. No apartan existencias.',
          'Puedes tener hasta 10 ventas en espera.',
        ],
        who: 'Quien puede vender.',
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
          '¿El cliente no está registrado? En "Cambiar" (cliente) toca "Registrar cliente nuevo": lo creas ahí mismo sin perder la venta.',
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
          'Con "WhatsApp" le envías al cliente el recibo en texto (productos, total y cómo pagó): eliges el contacto en WhatsApp.',
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
        id: 'pedidos',
        title: 'Pedidos por encargo',
        summary: 'Para trabajos que se entregan después: mesones en mármol o granito, tortas, uniformes, muebles. Anota lo que pidió el cliente, recibe anticipos y, al entregar, se convierte en una venta.',
        steps: [
          'Ve a Pedidos y toca "Nuevo pedido". Elige el cliente (con su teléfono, para avisarle), la fecha de entrega y, si aplica, la dirección de instalación.',
          'Agrega lo que pidió. Cada línea es un producto del catálogo: cóbralo por cantidad (3 unidades) o por medidas (ancho × largo en metros, para productos en M2). Escribe la descripción y el precio acordado.',
          'Guarda y recibe el anticipo: en efectivo entra hoy a tu caja abierta; por transferencia queda con su referencia.',
          'El día de la entrega abre el pedido y toca "Entregar". Marca lo que entregas (puede ser una parte): se registra una venta en tu caja y lo anticipado se descuenta solo.',
          'El resto lo paga con uno o varios medios: con "Agregar otro medio" paga una parte en efectivo y deja el resto fiado (si tiene cupo), o combina efectivo y transferencia.',
          'Con "Imprimir comprobante" (tiquete), "Descargar PDF" (hoja carta con tu logo, para enviarla) o "Enviar por WhatsApp" le das al cliente el detalle del pedido, lo abonado y lo que falta.',
        ],
        tips: [
          'Para distribuidores: registra cada tienda como cliente con cupo de fiado, toma su pedido sin anticipo y al entregar fía lo que no te paguen; lo cobras después en Fiados con "Abonar".',
          'Si no tienes el producto en el catálogo, crea uno genérico (por ejemplo "Mesón en granito" en M2 o "Torta por encargo" en unidades) con precio libre.',
          'El pedido no mueve inventario ni ingresos: eso pasa al entregarlo. El anticipo sí entra a la caja el día que lo recibes y en el cierre sale como "Anticipos de pedidos".',
          'Mientras esté abierto puedes editar lo pendiente; lo ya entregado no cambia.',
          'En el inicio y en Pedidos ves los atrasados y los que se entregan hoy.',
          'Si anulas la venta de una entrega, esas líneas vuelven a quedar pendientes y su anticipo vuelve a estar disponible.',
          'Cancelar un pedido devuelve el anticipo que no se ha aplicado (en efectivo sale de tu caja). Solo el dueño o un administrador cancelan.',
        ],
        who: 'Propietario, Administrador, Cajero y Vendedor crean, cobran anticipos y entregan; el Contador solo consulta.',
      },
      {
        id: 'cotizaciones',
        title: 'Cotizaciones',
        summary: 'Para pasarle precios a un cliente antes de que compre: un mesón, una lista de útiles, un pedido al por mayor. No mueve inventario ni dinero; si la aceptan, se convierte en pedido o en venta con los mismos precios.',
        steps: [
          'Ve a Cotizaciones y toca "Nueva cotización". Elige un cliente registrado o escribe el nombre y teléfono de alguien que aún no lo es.',
          'Agrega los productos por cantidad o por medidas (ancho × largo, para productos en M2), con el precio y, si quieres, un descuento por línea.',
          'Revisa hasta cuándo es válida (por defecto, los días que diga Ajustes) y las condiciones: anticipo, tiempo de entrega, garantía…',
          'Con "Descargar PDF" la guardas o imprimes en hoja carta con tu logo; con "Enviar por WhatsApp" le mandas el resumen.',
          'Si el cliente acepta, toca "Convertir en pedido" (para trabajos por encargo) o "Vender" (si se lleva todo ya, en tu caja abierta). Si no, "Rechazar" con el motivo.',
        ],
        tips: [
          'Al convertir en pedido la cotización de alguien sin registrar, el sistema te pide registrarlo como cliente. Si la vendes sin registrarlo, la venta queda a consumidor final.',
          'Una cotización vencida no se convierte: edítala para renovar la fecha y revisar los precios, o toca "Duplicar" para hacer una nueva igual.',
          'En el pedido el descuento queda incluido en el precio de cada línea.',
          'Los descuentos por encima del máximo de Ajustes necesitan el permiso de descuentos, igual que en el POS.',
          'Los días de vigencia y el texto de condiciones por defecto se cambian en Ajustes > Cotizaciones.',
        ],
        who: 'Propietario, Administrador, Cajero y Vendedor cotizan y convierten; el Contador solo consulta.',
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
    id: 'restaurante',
    title: 'Mesas, cocina y comandas',
    icon: 'pi pi-table',
    sections: [
      {
        id: 'configurar-mesas',
        title: 'Configurar las mesas',
        summary: 'Crea las zonas de tu local (Salón, Terraza, Barra) y sus mesas. Se prende en Ajustes → Tipo de negocio y '
          + 'módulos ("Mesas"; Restaurante lo trae prendido).',
        steps: [
          'Entra a Mesas y toca "Configurar".',
          'Toca "Nueva zona" y escribe su nombre.',
          'En la zona toca "Agregar mesas": di desde qué número y cuántas (por ejemplo, 1 a 10) y cuántos puestos tiene cada una.',
          'Toca una mesa para cambiarle el nombre (Barra 2), los puestos, la zona o desactivarla.',
        ],
        tips: [
          'El nombre de la mesa no se repite en la sucursal, para que el mesero no se confunda.',
          'Una mesa o zona con una cuenta abierta no se puede desactivar hasta cobrarla o moverla.',
        ],
        who: 'Propietario y Administrador.',
      },
      {
        id: 'mesas',
        title: 'Atender una mesa',
        summary: 'En Mesas ves el salón: las mesas libres punteadas y las ocupadas de color, con su total y cuánto llevan '
          + 'abiertas (más de una hora cambian de color).',
        steps: [
          'Toca una mesa libre, escribe cuántas personas son (opcional) y toca "Abrir cuenta".',
          'Toca los productos para pedirlos: si tienen adiciones se abren sus opciones y una nota. Quedan "Por agregar".',
          'Revisa cantidades y toca "Agregar a la cuenta" (con Cocina y comandas el botón dice "Enviar a cocina": agrega y '
            + 'sale la comanda de una vez). Puedes volver a pedir más tarde las veces que quieras.',
          'Para quitar algo toca la caneca y escribe el motivo: queda tachado en la cuenta.',
          'Con "Mover" la pasas a otra mesa libre y con "Unir" traes los productos de otra cuenta (esa mesa queda libre).',
          'Para llevar y domicilios se abren con los botones de arriba; el domicilio pide la dirección.',
        ],
        tips: [
          'Todo el equipo de la sucursal ve todas las mesas y quién pidió cada cosa.',
          'Cancelar una cuenta con productos, o quitar lo que ya salió a cocina, lo hace caja o el administrador, con motivo.',
          'La pantalla se actualiza sola cada pocos segundos.',
        ],
        who: 'Quien tenga el permiso "Atender mesas" (Propietario, Administrador, Cajero, Vendedor y Mesero).',
      },
      {
        id: 'comandas',
        title: 'Enviar a cocina e imprimir comandas',
        summary: 'Con el módulo "Cocina y comandas" (Ajustes → Tipo de negocio y módulos; necesita Mesas) lo pedido en una '
          + 'cuenta sale en una comanda por estación: la hamburguesa a Cocina, la limonada al Bar.',
        steps: [
          'En la cuenta pide los productos y toca "Enviar a cocina": quedan en la cuenta y sale la comanda.',
          'Cada línea dice en qué comanda salió (Cocina #12). Si algo quedó sin enviar, arriba aparece "Enviar ahora".',
          'En el computador que tiene la impresora entra a Comandas y marca, en "Impresora de este equipo", las '
            + 'estaciones que imprime (Cocina, Bar). Mientras XASKA esté abierto ahí, imprime solo cada comanda nueva.',
          'Para que Chrome imprima sin preguntar, crea un acceso directo a Chrome y agrega al final del destino '
            + '--kiosk-printing (por ejemplo: "chrome.exe" --kiosk-printing https://app.xaska.co). Elige la impresora '
            + 'térmica como predeterminada en Windows.',
          'Para volver a sacar una comanda toca "Reimprimir" en Comandas o en la cuenta.',
        ],
        tips: [
          'El término de la carne (y cualquier opción obligatoria de una sola elección, como el tamaño) sale destacado en '
            + 'negro para que la cocina no lo pase por alto.',
          'Cada comanda la imprime un solo equipo, aunque haya dos marcados para la misma estación.',
          'Reimprimir queda en la auditoría. Si quitas algo que ya salió, avísale a la cocina: la comanda reimpresa lo '
            + 'muestra como ANULADO.',
          'Comandas se actualiza sola cada pocos segundos; la pantalla de cocina en tiempo real llega pronto.',
        ],
        who: 'Enviar e imprimir: permiso "Enviar pedidos a cocina" (Propietario, Administrador, Cajero, Vendedor y Mesero).',
      },
      {
        id: 'estaciones',
        title: 'Estaciones de cocina',
        summary: 'Las estaciones dicen a dónde sale cada producto. Cocina es la principal: recibe todo lo que no tenga otra.',
        steps: [
          'En Comandas toca "Estaciones" y luego "Nueva estación" (por ejemplo, Bar).',
          'En "Recibe" marca las categorías (Bebidas, Licores) o busca productos sueltos.',
          'Guarda. Desde ese momento lo de esas categorías sale en la comanda del Bar.',
        ],
        tips: [
          'Un producto asignado suelto manda sobre su categoría.',
          'Una estación inactiva no recibe nada: lo suyo sale por la principal.',
          'Para que otra sea la principal, edítala y marca "Estación principal".',
        ],
        who: 'Propietario y Administrador (permiso "Configurar las estaciones de cocina").',
      },
      {
        id: 'mesero',
        title: 'El rol Mesero',
        summary: 'Para quien atiende las mesas desde el celular o una tableta: abre cuentas, pide, envía a cocina, mueve y '
          + 'une mesas, consulta productos y clientes, cobra con su caja y ve sus ventas del día.',
        steps: [
          'En Usuarios invita a la persona y elige el rol "Mesero" y su sucursal.',
          'Entra desde el celular: en Mesas toca la mesa, pide en "Pedir" y toca "Enviar a cocina".',
        ],
        tips: [
          'Lo que ya salió a cocina no lo quita el mesero: lo anula caja o el administrador, con motivo.',
          'Si prefieres que el mesero no cobre, en Roles y permisos quítale "Registrar ventas" y "Abrir, mover y cerrar caja".',
        ],
        who: 'Lo asigna el Propietario o el Administrador.',
      },
      {
        id: 'cobrar-mesa',
        title: 'Cobrar una mesa',
        summary: 'La cuenta se cobra completa en Vender, con el diálogo de pago de siempre; se vuelve una venta normal.',
        steps: [
          'En la cuenta toca "Cobrar": se abre Vender con sus productos (necesitas la caja abierta en esa sucursal).',
          'Si es un cliente registrado, cámbialo en el carrito; luego toca Cobrar (F4) y registra el pago.',
          'Al cerrar el tiquete vuelves a las mesas: la mesa ya queda libre.',
        ],
        tips: [
          'Se cobra el precio vigente; si alguno cambió mientras la mesa comía, lo verás en el total antes de cobrar.',
          'En Vender los productos de la cuenta no se cambian: "Volver a la cuenta" para agregar o quitar.',
          'Dividir la cuenta, la propina y los pagos por partes llegan pronto.',
        ],
        who: 'Quien vende con la caja abierta.',
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
          'Se abre el informe: toca "Imprimir ticket" para sacarlo en la impresora del tiquete (para firmarlo y guardarlo con el dinero) o "Enviar por WhatsApp" para mandar el resumen.',
        ],
        tips: [
          'El cierre es "ciego": quien cierra no ve cuánto debería haber, así el conteo es honesto. La diferencia la ve quien supervisa.',
          '"Informe parcial" muestra cómo va el turno sin cerrarlo.',
          'En "Historial de caja" están todos los turnos con su informe; desde "Informe" puedes reimprimir el ticket de un cierre.',
          'Al cerrar, al correo del dueño llega un resumen con las ventas, los medios de pago y la diferencia, aunque cierre un cajero. Se apaga en Ajustes.',
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
        summary: 'Solo necesitas el nombre y el precio; lo demás tiene valores listos que puedes cambiar.',
        steps: [
          'Ve a Productos y toca "Nuevo producto".',
          'Escribe el nombre y el precio de venta. Si quieres saber cuánto ganas, escribe también el costo.',
          'Escanea el código de barras del empaque. Si no tiene, toca "Generar código interno".',
          'Guarda. El código interno (SKU) se crea solo con el nombre si lo dejas vacío.',
          'Te preguntamos si quieres registrar cuántas unidades tienes: di que sí y escribe la cantidad.',
        ],
        tips: [
          'En "Más opciones" están las presentaciones (vender por caja de 24, con su código y precio) y los precios de otras listas.',
          'En Ajustes indica si tus precios ya incluyen el IVA ("Los precios incluyen impuestos").',
          'Desactivar un producto lo oculta del punto de venta sin borrar su historia.',
        ],
        who: 'Propietario, Administrador y Bodeguero.',
      },
      {
        id: 'precio-libre',
        title: 'Precio libre: impresiones, servicios y "Varios"',
        summary: 'Para lo que cambia de precio cada vez (impresiones, anillados, arreglos): al venderlo escribes cuánto cobras.',
        steps: [
          'En el producto marca "Precio libre: pedir el precio al vender". El precio que escribas queda como sugerido.',
          'Al venderlo, la app pregunta "¿Cuánto cobras?". Escribe el valor y toca "Agregar".',
          'Si te equivocaste, toca la línea en la venta y cambia el precio.',
        ],
        tips: [
          'Cada vez que lo agregas va en su propia línea: dos impresiones pueden tener precios distintos.',
          'Todo negocio trae el producto "Varios", de precio libre y sin inventario, para vender algo que todavía no has creado sin frenar la fila. Revisa su impuesto (viene con IVA 19 %).',
          'Quién puede venderlo se define en Roles con el permiso "Vender productos de precio libre". Viene activado para Propietario, Administrador, Cajero y Vendedor.',
          'El precio que se cobró queda en la venta y en los reportes.',
        ],
      },
      {
        id: 'importar-productos',
        title: 'Importar productos desde Excel',
        summary: 'Carga muchos productos de una vez llenando una plantilla de Excel.',
        steps: [
          'En Productos toca "Importar desde Excel" y luego "Descargar plantilla de Excel".',
          'Ábrela y escribe un producto por fila (la hoja "Instrucciones" explica cada columna). Guárdala.',
          'Súbela con "Elegir archivo" y toca "Revisar": el sistema te muestra qué filas tienen errores antes de guardar nada.',
          'Corrige lo que falte y confirma la importación.',
        ],
        tips: ['Si un SKU ya existe, ese producto se actualiza con los datos del archivo.'],
      },
      {
        id: 'tallas-colores',
        title: 'Productos con tallas y colores (calzado y ropa)',
        summary: 'Un modelo (p. ej. "Tenis Runner") con un solo precio crea un producto por cada talla y color, cada uno con su código de barras y su propia existencia.',
        steps: [
          'En Productos toca "Con tallas" y luego "Nuevo modelo".',
          'Escribe el prefijo del SKU (p. ej. RUN), el nombre, el impuesto y el precio de venta.',
          'Elige la escala (Calzado Colombia, EU, US, niño, ropa…), marca las tallas que vendes y escribe los colores separados por comas.',
          'Toca "Crear modelo": se crean todas las variantes (RUN-38-NEGRO, RUN-39-NEGRO…) cada una con su propio código de barras interno.',
          'Para cargar o contar existencias, en el documento de inventario toca "Por tallas" y llena la cuadrícula talla × color.',
          'Al vender, el modelo sale en una sola tarjeta: tócala y elige la talla (ves cuántas hay de cada una). Con el lector, el código de cada talla la agrega directo.',
        ],
        tips: [
          'El precio de venta (al público), el nombre y el impuesto se cambian en el modelo y se aplican a todas sus tallas. El costo es lo que pagas al proveedor.',
          'Si el proveedor trae su propio código de barras, toca la casilla de esa talla y escanéalo: reemplaza al interno.',
          'En "Escalas de tallas" puedes escribir la equivalencia de cada talla (38 = EU 39 / US 7) o crear tus propias escalas.',
          'Desactivar el modelo desactiva todas sus tallas; también puedes desactivar una sola talla que ya no vendes.',
        ],
        who: 'Propietario, Administrador y Bodeguero.',
      },
      {
        id: 'bascula',
        title: 'Báscula: vender lo que se pesa',
        summary: 'Lee las etiquetas que imprime la báscula etiquetadora (el código empieza por 2) o vende por valor ($5.000 de queso).',
        steps: [
          'Crea el producto con unidad base KG (o LB) y su precio por kilo.',
          'En Productos toca "Báscula": activa "Leer etiquetas", elige cómo empieza el código, cuántos dígitos tiene el PLU y si la etiqueta trae el peso o el precio. Compara el ejemplo con una etiqueta real.',
          'Toca "Asignar PLU" y pon a cada producto el mismo PLU que tiene en la báscula.',
          'En Vender, escanea la etiqueta: entra el producto con el peso (o, si trae el precio, con la cantidad que da ese valor).',
        ],
        tips: [
          'Vender por valor sin báscula: en el carrito toca la línea y escribe el valor en "O vende por valor ($)"; la cantidad se calcula sola.',
          'Si la etiqueta trae el precio, el total queda igual al de la etiqueta (puede variar unos pocos pesos por redondeo).',
        ],
        who: 'Configurar: Propietario, Administrador y Bodeguero. Vender: quien usa la caja.',
      },
      {
        id: 'adiciones',
        title: 'Adiciones: tamaños, extras y notas',
        summary: 'Para lo que se pide "a la medida": un granizado grande con shot extra, una hamburguesa sin cebolla. '
          + 'Se prende en Ajustes → Tipo de negocio y módulos (Restaurante lo trae prendido).',
        steps: [
          'Entra a Adiciones (en Todo) y toca "Nuevo grupo". Puedes empezar con una plantilla: Término de la carne (azul, '
            + 'medio, tres cuartos, bien asado), Tamaño, Salsas o Sin… y ajustarla.',
          'Ponle nombre (Tamaño, Licor, Extras) y di si se elige una sola opción o varias, y si es obligatorio.',
          'Escribe las opciones con lo que suman al precio: Mediano 0, Grande 4000; Sin licor −2000. En las de varias, '
            + 'di hasta cuántas veces se repite cada una (Shot extra hasta ×3).',
          'En "Se aplica a" marca las categorías (sirve también para los productos que crees después) o busca productos sueltos.',
          'En Vender, al tocar o escanear el producto se abren sus opciones: elige, escribe una nota si hace falta y toca "Agregar".',
        ],
        tips: [
          'El mismo producto con otras adiciones o con otra nota va en otra línea del carrito.',
          'En un producto sin adiciones también puedes poner una nota: toca la línea del carrito y escribe en "Nota".',
          'Las adiciones y la nota salen en el tiquete, en el detalle de la venta y en el mensaje de WhatsApp.',
          'Abajo de Adiciones ves lo más pedido de los últimos 30 días (con permiso de reportes).',
          'Por ahora las adiciones no descuentan inventario; llegará con las recetas.',
        ],
        who: 'Configurar: Propietario y Administrador (permiso "Crear y editar adiciones"). Vender: quien usa la caja.',
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
      {
        id: 'fiado',
        title: 'Fiado: vender a crédito y recibir abonos',
        summary: 'Fíale a tus clientes de confianza hasta un cupo, recibe sus abonos y mira quién te debe y desde cuándo.',
        steps: [
          'En Clientes, edita al cliente y escribe su "Cupo de fiado": lo máximo que puede quedar debiendo. Solo el dueño o un administrador lo asignan.',
          'Al vender, elige el cliente. Al cobrar aparece "Fiado" con lo que tiene disponible: tócalo para fiar todo, o usa "Pago mixto" para que pague una parte y fíe el resto.',
          'Cuando venga a pagar, ve a Fiados, busca al cliente y toca "Abonar". Escribe cuánto paga y con qué medio.',
          'En Fiados ves cuánto te deben en total y por antigüedad (hasta 30 días, de 31 a 60 y más de 60). Toca un cliente para ver su estado de cuenta.',
          'Con "Recordar" se abre WhatsApp con un mensaje amable y el saldo listo para enviar.',
        ],
        tips: [
          'Los abonos en efectivo entran a tu caja abierta y salen en el cierre como "Abonos de fiado". Por transferencia también necesitas tu caja abierta (el dueño o un administrador pueden registrarlo sin caja).',
          'Los cajeros y vendedores fían dentro del cupo y reciben abonos con su caja abierta (o en la caja compartida); pasar el cupo, anular abonos y recibirlos sin caja solo lo hacen el dueño o un administrador.',
          'Si anulas una venta fiada, lo fiado se le descuenta al cliente solo.',
          'Los abonos pagan primero lo más viejo: la antigüedad muestra desde cuándo debe lo que queda.',
          'En los reportes de ventas por medio de pago, lo fiado aparece como "Fiado".',
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
            ['Vendedor', 'Abre su propia caja y vende; consulta productos y existencias. No registra clientes ni anula ventas.'],
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
          '"Sin rotación" muestra los productos con existencia que no se venden hace 30, 60, 90 o 180 días, primero los que tienen más plata quieta: buenos candidatos para una promoción. En el inicio aparece un aviso con lo de 90 días.',
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
          'Enviarme el resumen de cada cierre de caja: llega al correo del dueño cada vez que se cierra una caja.',
          'Marca: sube tu logo (sale en el encabezado y en el tiquete) y elige el color de la app entre los de la paleta; toca un color para verlo antes de guardarlo.',
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
