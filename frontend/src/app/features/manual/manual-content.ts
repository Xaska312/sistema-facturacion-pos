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
          'Elige el tipo de negocio: Comercio, Servicios, Restaurante o Droguería.',
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
          'Con "Enviar" le mandas el recibo al cliente: "WhatsApp (texto)" abre WhatsApp con los productos, el total y cómo pagó, y eliges el contacto; "Imagen del tiquete" lo manda como una foto igual al tiquete impreso, con tu logo (en el celular se abre el menú de compartir; en el computador se descarga el PNG para adjuntarlo).',
        ],
        tips: [
          'El texto del pie del tiquete (horarios, redes sociales…) se cambia en Configuración → Ajustes.',
          'El tiquete es un comprobante de venta; por ahora el sistema no emite factura electrónica de la DIAN.',
          'Si el tiquete sale cortado a la derecha o muy claro: en la ventana de impresión pon Márgenes en "Ninguno" y '
            + 'Escala en "Predeterminado"; en las preferencias de la impresora en Windows sube la densidad u oscuridad. '
            + 'Lo más nítido es imprimir directo con XASKA Impresora.',
        ],
      },
      {
        id: 'impresora-cajon',
        title: 'Imprimir directo y abrir el cajón',
        summary: 'Con el programa XASKA Impresora en el computador de la caja, el tiquete sale directo en la impresora '
          + 'térmica (sin la ventana de impresión) y el cajón monedero se abre solo al cobrar en efectivo.',
        steps: [
          'En el computador de la caja entra a Configuración → Ajustes → "Impresora de este equipo" y toca "Descargar '
            + 'XASKA Impresora". Guárdalo en una carpeta fija (por ejemplo Documentos) y ábrelo con doble clic. Cuando '
            + 'pregunte si arranca con Windows, di que sí.',
          'Vuelve a Ajustes y toca "Buscar de nuevo". Si el navegador pregunta si XASKA puede usar los dispositivos '
            + 'de este equipo, toca "Permitir".',
          'Elige tu impresora y el ancho del papel, y toca "Imprimir prueba".',
          'Prende "Imprimir el tiquete solo al cobrar" si quieres el tiquete en cada venta, y deja "Abrir el cajón al '
            + 'cobrar en efectivo" como prefieras. Si casi nunca lo piden (una tienda que vende un dulce), déjalo apagado: '
            + 'sale solo cuando tocas "Imprimir tiquete" después de la venta.',
          'También lo cambias al cobrar: en la ventana de Cobrar, abajo a la izquierda, "Tiquete al cobrar". Se recuerda '
            + 'en ese computador.',
          'Para abrir el cajón sin una venta (dar cambio, revisar el efectivo), toca "Abrir cajón" en Vender.',
        ],
        tips: [
          'Volver a imprimir un tiquete nunca abre el cajón. Con tarjeta o transferencia tampoco se abre.',
          '"Abrir cajón" pide el permiso "Abrir el cajón monedero sin una venta" y la caja abierta; cada vez queda en la auditoría.',
          'Si las tildes salen como símbolos raros, prende "Imprimir sin tildes".',
          'El logo de Ajustes → Marca sale arriba del tiquete en blanco y negro. Se ve mejor un logo de colores fuertes '
            + 'sobre fondo blanco; los colores claros salen punteados.',
          'Funciona en Windows con Chrome o Edge. El cajón va conectado a la impresora (el cable tipo teléfono).',
        ],
        who: 'Lo configura el dueño o el administrador en cada computador de caja.',
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
        id: 'empezar-restaurante',
        title: 'Empezar con un restaurante',
        summary: 'Al crear el negocio elige "Restaurante": trae mesas, cocina y comandas, adiciones y pedidos (el fiado se '
          + 'prende en Ajustes si lo necesitas). En el inicio, "Primeros pasos" te guía en orden.',
        steps: [
          'Crea tus zonas y mesas.',
          'Crea las categorías (entradas, platos, bebidas…) y carga tu menú.',
          'Crea las adiciones con las plantillas: término de la carne, tamaños, salsas, "sin…".',
          'Si tienes bar, créalo en Comandas → Estaciones y asígnale las bebidas.',
          'En Ajustes revisa la propina sugerida y, si eres responsable de INC, aplícalo a tus categorías.',
          'Invita a tus meseros (rol Mesero) y a la cocina (rol Cocina), abre la caja y atiende tu primera mesa.',
        ],
        who: 'El dueño del negocio.',
      },
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
          'Toca "Plano" en la zona y arrastra cada mesa a donde está en tu local. Tócala para elegir si es cuadrada, '
            + 'redonda o rectangular y su tamaño. Toca "Guardar plano".',
          'Si cada piso tiene su caja (y tienes dos cajas o más), edita la zona con el lápiz y elige su "Caja de esta '
            + 'zona". Las ventas de esas mesas quedan en esa caja aunque se cobren en otra; al cerrar, las dos cajas '
            + 'cuadran el efectivo juntas.',
        ],
        tips: [
          'El nombre de la mesa no se repite en la sucursal, para que el mesero no se confunda.',
          'Una mesa o zona con una cuenta abierta no se puede desactivar hasta cobrarla o moverla.',
          'Si tienes dos pisos, crea una zona por piso: cada una tiene su plano.',
          'Una mesa nueva aparece sola en un hueco del plano; "Acomodar en filas" las ordena todas.',
        ],
        who: 'Propietario y Administrador.',
      },
      {
        id: 'cartas-por-piso',
        title: 'Cartas por piso',
        summary: 'Para un local con dos pisos y una carta en cada uno (comida rápida abajo, cócteles arriba): lo de cada '
          + 'carta se cobra en la caja de su piso, aunque la mesa esté en el otro piso o el cliente pague en la otra caja. '
          + 'Plan Empresa.',
        steps: [
          'Necesitas una caja por piso (Configuración → Cajas). Luego entra a Mesas → "Configurar" → "Cartas por piso".',
          'Toca "Nueva carta", escribe su nombre (Piso 2), elige en qué caja se cobra y marca sus categorías (Cócteles, '
            + 'Cervezas). Si un producto suelto es de esa carta, búscalo y agrégalo.',
          'Al pedir en una mesa, arriba de los productos elige la carta ("Piso 1", "Piso 2" o "Todas las cartas"). El '
            + 'equipo recuerda la última que usaste.',
          'Al cobrar una cuenta con productos de las dos cartas, XASKA registra una venta por caja (la hamburguesa en la '
            + 'Caja 1 y la margarita en la Caja 2) y reparte el pago en proporción. El cliente recibe un solo tiquete con '
            + 'las dos partes y el total.',
        ],
        tips: [
          'Las dos cajas deben estar abiertas: si la de una carta está cerrada, XASKA dice cuál abrir.',
          'La propina y el cambio quedan en la caja donde se cobró. Al cerrar, cada caja ve lo vendido de su carta; el '
            + 'efectivo se cuadra entre las dos.',
          'Lo que no está en ninguna carta se cobra en la caja de la zona de la mesa o, si no tiene, en la de quien cobra.',
          'Una carta inactiva deja de mandar: lo suyo vuelve a cobrarse como antes.',
        ],
        who: 'La configura el Propietario o el Administrador; la caja cobra como siempre.',
      },
      {
        id: 'mapa-mesas',
        title: 'El mapa de mesas y sus colores',
        summary: 'En Mesas ves el plano de cada zona con las mesas donde están en el local, y cada una del color de en qué va.',
        steps: [
          'Verde: libre. Tócala para abrir su cuenta.',
          'Gris: ocupada, todavía no ha pedido a cocina.',
          'Amarillo: su pedido está en cocina.',
          'Azul: hay platos listos para llevar.',
          'Morado: comiendo, ya tiene todo servido.',
          'Rojo: pidió la cuenta. En la cuenta, el mesero toca "Pidió la cuenta"; si pide algo más, se quita solo.',
        ],
        tips: [
          'Arriba eliges ver el "Plano" o la "Lista"; el equipo lo recuerda.',
          'Si tu cocina solo imprime la comanda, el mesero toca "Entregada" en la cuenta cuando lleva el plato: así la '
            + 'mesa pasa a morado.',
          'Los colores se actualizan solos en todos los celulares y en la caja.',
        ],
        who: 'Meseros, caja y quien atienda las mesas.',
      },
      {
        id: 'mesas',
        title: 'Atender una mesa',
        summary: 'En Mesas ves el salón: las mesas libres punteadas y las ocupadas de color, con su total y cuánto llevan '
          + 'abiertas (más de una hora cambian de color).',
        steps: [
          'Toca una mesa libre, ajusta cuántas personas son con − y + (empieza en 2) y toca "Abrir cuenta".',
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
          'Todo llega al instante: la impresora saca la comanda apenas se envía y, si anulan algo que ya salió, imprime un '
            + 'aviso de ANULACIÓN.',
        ],
        who: 'Enviar e imprimir: permiso "Enviar pedidos a cocina" (Propietario, Administrador, Cajero, Vendedor y Mesero).',
      },
      {
        id: 'pantalla-cocina',
        title: 'Pantalla de cocina',
        summary: 'Para una tableta o un televisor en la cocina: las comandas llegan al instante, en letra grande, y la '
          + 'cocina las marca Preparando y Lista con un toque. Se usa con el rol Cocina o con un administrador.',
        steps: [
          'En el equipo de la cocina entra con el usuario de la cocina y abre "Cocina" (en el dock o en Todo).',
          'Toca "Activar sonido" (el navegador lo pide una vez) y "Pantalla completa".',
          'Si hay varias estaciones, arriba elige cuáles ve esta pantalla (por ejemplo, solo Cocina; el bar tiene la suya).',
          'Cuando empieces un plato toca "Preparando"; al terminarlo, "Lista": a quien lo envió le llega un aviso con '
            + 'sonido y en Mesas la mesa dice "Lista".',
          'Cuando el mesero lo lleve, él lo marca "Entregada" en la cuenta (o la cocina en la pantalla) y sale de la lista.',
        ],
        tips: [
          'Cada tarjeta muestra los minutos desde que salió: amarilla desde 10 y roja desde 20.',
          'El término de la carne sale resaltado; lo anulado sale tachado con una alarma y un aviso arriba.',
          '"Deshacer" devuelve la comanda un paso si se tocó por error.',
          'Si se cae la conexión dice "Reconectando…" y se sigue actualizando cada 15 segundos.',
          'Una misma cuenta puede tener hasta 10 pantallas con avisos en vivo (Cocina, Mesas, Comandas). Si abres una '
            + 'más, la más vieja dice "Los avisos en vivo pasaron a otra pantalla" y sigue actualizándose cada pocos '
            + 'segundos; con "Recibir avisos aquí" los vuelve a tomar. Para muchas pantallas, mejor un usuario por estación.',
        ],
        who: 'Permiso "Usar la pantalla de cocina" (Propietario, Administrador y el rol Cocina).',
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
        summary: 'Para quien atiende las mesas desde el celular o una tableta: abre cuentas con las personas, pide, envía '
          + 'a cocina, entrega, mueve y une mesas. Al entrar va directo a Mesas y su menú solo tiene eso. No cobra: cobra '
          + 'la caja.',
        steps: [
          'En Usuarios invita a la persona y elige el rol "Mesero" y su sucursal.',
          'Entra desde el celular: en Mesas toca la mesa, pide en "Pedir" y toca "Enviar a cocina".',
        ],
        tips: [
          'Lo que ya salió a cocina no lo quita el mesero: lo anula caja o el administrador, con motivo.',
          'Si quieres que tu mesero cobre, en Roles y permisos dale al rol Mesero "Registrar ventas" y "Abrir, mover y '
            + 'cerrar caja": vuelve a ver Vender y su caja.',
          'Si ya habías cambiado los permisos del rol Mesero, XASKA no los tocó: sigue como lo dejaste.',
        ],
        who: 'Lo asigna el Propietario o el Administrador.',
      },
      {
        id: 'rol-cocina',
        title: 'El rol Cocina',
        summary: 'Para el cocinero o el bartender: solo ve la pantalla de cocina y marca los platos. No ve ventas, caja, '
          + 'clientes ni precios.',
        steps: [
          'En Usuarios invita a la persona (o crea un usuario para la tableta de la cocina) con el rol "Cocina" y su sucursal.',
          'Al entrar, abre "Cocina" desde el dock.',
        ],
        who: 'Lo asigna el Propietario o el Administrador.',
      },
      {
        id: 'cobrar-mesa',
        title: 'Cobrar una mesa',
        summary: 'La cuenta se cobra en Vender, con el diálogo de pago de siempre: toda junta, por productos (cada quien lo '
          + 'suyo) o en partes iguales. Cada cobro es una venta normal, con su tiquete.',
        steps: [
          'En la cuenta toca "Cobrar" y elige cómo: "Toda la cuenta", "Por productos" o "Partes iguales" (necesitas la caja '
            + 'abierta en esa sucursal).',
          'Por productos: marca lo que paga esta persona (por ejemplo, una de las dos hamburguesas) y toca "Cobrar esta '
            + 'parte". Lo demás queda en la cuenta para la siguiente persona.',
          'Partes iguales: di entre cuántas personas; al cobrar ves cuánto paga cada una y registras los pagos de todos '
            + '(con "Pago mixto" si unos pagan en efectivo y otros con tarjeta).',
          'En el cobro pregúntale al cliente por la propina: "Sí, 10 %", "Otro valor" o "Sin propina", y con qué la paga.',
          'Al cerrar el tiquete vuelves a la cuenta si falta algo por cobrar, o a las mesas si ya quedó libre.',
        ],
        tips: [
          'La propina es voluntaria y va aparte: no suma a la venta ni lleva IVA ni INC, y sale en el tiquete como '
            + '"Propina voluntaria". La sugerida se cambia en Ajustes → Mesas.',
          'Si la propina es en efectivo entra a la caja; en el arqueo sale aparte como "Propinas en efectivo".',
          'Lo ya cobrado sale como "Cobrado" en la cuenta y no se puede quitar: para devolverlo, anula su venta (también '
            + 'devuelve su propina).',
          'Se cobra el precio vigente; si alguno cambió mientras la mesa comía, lo verás en el total antes de cobrar.',
        ],
        who: 'Quien vende con la caja abierta.',
      },
      {
        id: 'propinas',
        title: 'Propinas y su reparto',
        summary: 'Las propinas son del equipo de trabajo (ley 1935 de 2018). En Propinas ves lo recogido en un periodo y '
          + 'registras el reparto en partes iguales.',
        steps: [
          'Entra a Propinas (en Todo → Reportes) y elige el periodo (máximo un mes).',
          'Revisa lo recogido, por medio de pago, y lo pendiente por repartir.',
          'Toca "Repartir": escribe el valor, marca entre quiénes se reparte (meseros, cocina…) y mira cuánto le toca a cada uno.',
          'Si lo entregas en efectivo, deja marcado "Lo entrego en efectivo desde mi caja" (sale de tu caja abierta). Si '
            + 'no, queda registrado como entregado por fuera.',
        ],
        tips: [
          'El reparto queda con quién recibió cuánto y no se puede cambiar.',
          'Las propinas de ventas anuladas no cuentan.',
          'Si anulas una venta cuya propina ya repartiste, la propina se le devuelve al cliente y arriba sale '
            + '"Repartido de más": se descuenta de las próximas propinas antes de que haya algo por repartir.',
          'Lo recomendable es repartir al menos una vez al mes.',
        ],
        who: 'Propietario y Administrador (permiso "Ver las propinas recogidas y registrar su reparto").',
      },
      {
        id: 'impuesto-consumo',
        title: 'Impuesto al consumo (INC 8 %)',
        summary: 'Los restaurantes, cafeterías y bares responsables del impuesto al consumo cobran el 8 % en lo que '
          + 'preparan, en lugar del IVA. El asistente lo deja listo en tus productos.',
        steps: [
          'En Ajustes, en "Impuesto al consumo (INC 8 %)", responde si tu negocio es responsable (si dudas, pregúntale a tu contador).',
          'Si sí, marca las categorías de comidas y bebidas que preparas y toca "Aplicar INC 8 %".',
        ],
        tips: [
          'Con precios con impuesto incluido el precio de venta no cambia: cambia cuánto es base y cuánto impuesto.',
          'Las ventas anteriores no cambian. A los productos nuevos de esas categorías elígeles "INC 8 %" o vuelve a aplicarlo.',
          'Lo que no preparas (gaseosas y paquetes para revender) puede seguir con IVA: déjalo en otra categoría.',
        ],
        who: 'Propietario y Administrador (ajustes y productos).',
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
            ['Egreso', 'Pagas algo con el efectivo de la caja (un domicilio, un arreglo). Es un gasto: eliges en qué '
              + 'se gastó y, si quieres, le tomas foto al recibo.'],
            ['Retiro', 'Sacas dinero para guardarlo o consignarlo. No es un gasto.'],
          ],
        },
        steps: [
          'Ingreso o retiro: en "Mi caja" toca el botón, escribe el valor y el motivo, y guarda.',
          'Egreso: toca "Egreso", escribe cuánto fue, elige en qué se gastó (servicios, transporte, insumos…), agrega una '
            + 'nota o la foto del recibo si quieres, y toca "Registrar gasto". El efectivo sale de la caja y el gasto '
            + 'queda en Gastos con su categoría.',
        ],
        tips: ['No se puede sacar más efectivo del que debería haber en la caja.'],
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
          'Desactivar un producto lo oculta del punto de venta sin borrar su historia; puedes volver a activarlo. '
            + '"Eliminar" lo quita para siempre de las listas y libera su SKU y su código de barras; las ventas '
            + 'anteriores lo conservan.',
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
        id: 'ficha-medicamento',
        title: 'Ficha del medicamento (droguerías)',
        summary: 'Con el módulo Medicamentos, cada producto lleva su ficha: tipo de producto, registro sanitario INVIMA, '
          + 'CUM, principio activo y condición de venta. Es lo que revisa la Secretaría de Salud en la visita.',
        steps: [
          'Entra a Productos → Nuevo producto (o abre uno que ya tienes).',
          'En "Ficha del medicamento", busca en el catálogo del INVIMA por nombre, principio activo o CUM y toca la '
            + 'presentación que vendes (revisa que sea la misma caja). Se llenan el registro, el CUM, el principio '
            + 'activo, la forma y el ATC; en un producto nuevo también el nombre y el impuesto Excluido.',
          'Elige la condición de venta: bajo fórmula médica, venta libre, control especial o monopolio del Estado. Si no '
            + 'estás seguro, déjalo bajo fórmula: el catálogo del INVIMA no trae este dato.',
          'Marca si necesita nevera y si se puede vender por unidad (sobres o blíster con su lote y vencimiento). '
            + 'Medicamentos, fitoterapéuticos y dispositivos médicos controlan lotes y vencimientos siempre; en los '
            + 'demás tipos márcalo si lo quieres.',
          'Pon el precio y el código de barras y guarda.',
        ],
        tips: [
          'Un antibiótico (código ATC J01) queda marcado solo: siempre con fórmula médica y nunca por unidad.',
          'Los de control especial no se venden por unidad.',
          'En Productos y en Vender puedes buscar por el principio activo ("acetaminofen") además del nombre.',
          'Los cosméticos, dispositivos y suplementos llevan tipo y registro, sin condición de venta.',
          'El catálogo del INVIMA lo actualiza XASKA; si una presentación nueva no aparece, llena la ficha a mano.',
          'Si el producto no tiene categoría, XASKA te sugiere una por el código ATC (Antibióticos, Analgésicos, '
            + 'Cardiovascular…): si ya la tienes la elige; si no, toca "Crearla y usarla" o "No, gracias".',
        ],
        who: 'Propietario, Administrador y quien gestione productos; los demás la ven sin cambiarla.',
      },
      {
        id: 'recibir-compra',
        title: 'Recibir mercancía de un proveedor (compras)',
        summary: 'Cuando llega un pedido lo registras contra la factura del proveedor: revisas cada producto, anotas '
          + 'lote y vencimiento, rechazas lo que llegó mal y sube el inventario con el costo promedio. En una droguería '
          + 'es la recepción técnica que exige la Resolución 1403 de 2007.',
        steps: [
          'Entra a Compras → Recibir mercancía.',
          'Busca el proveedor (debe estar creado en Proveedores) y escribe el número y la fecha de su factura.',
          'Escanea o busca cada producto de la factura. Escribe la cantidad, la presentación (unidad o caja) y el costo '
            + 'sin IVA tal como viene en la factura; el IVA % sale del producto (cámbialo si la factura dice otro).',
          'En medicamentos escribe el lote y la fecha de vencimiento como vienen en el empaque. Si un mismo producto '
            + 'llegó en dos lotes, agrégalo dos veces.',
          'Si algo llegó roto, vencido o no coincide, toca "Rechazar" y escribe el motivo: queda en la recepción pero '
            + 'no entra al inventario ni se le debe al proveedor.',
          'Si llegó algo de nevera, anota la temperatura que marcó el termómetro (debe estar entre 2 y 8 °C).',
          'Marca los puntos de la revisión técnica.',
          'Elige "De contado" (y el medio: en efectivo sale de tu caja abierta) o "A crédito" con la fecha en que '
            + 'vence. Toca "Registrar recepción".',
        ],
        tips: [
          'No se puede recibir un producto vencido; lo que vence en menos de 6 meses se puede recibir, pero te avisa.',
          'Un lote ya registrado con otra fecha de vencimiento se rechaza: revisa el empaque (puede ser un error o un '
            + 'producto adulterado).',
          'La misma factura del mismo proveedor no se puede registrar dos veces.',
          'La recepción no se edita ni se borra: es tu soporte ante la Secretaría de Salud. Si después devuelves algo, '
            + 'hazlo con un ajuste de inventario.',
          'El costo del producto se recalcula solo (costo promedio) con cada compra.',
        ],
        who: 'Propietario, Administrador y Bodega. Pagar de contado necesita además el permiso de pagar a proveedores.',
      },
      {
        id: 'que-comprar',
        title: 'Qué comprar: el pedido sugerido a cada proveedor',
        summary: 'XASKA calcula cuánto pedirle a cada proveedor con lo que vendes, lo que tienes y tus mínimos, y te '
          + 'deja el mensaje listo para WhatsApp o la hoja para imprimir. No se guarda ningún pedido.',
        steps: [
          'Entra a Compras → "Qué comprar" (o desde el menú, en Inventario). Si tienes varias sucursales, elige una.',
          'Revisa cada proveedor: lo que hay, lo vendido en 7 y 30 días, el sugerido y el valor estimado.',
          'Cambia la cantidad a pedir donde quieras (0 = no pedir) y los días de cada proveedor.',
          'Si tienes XASKA IA, toca "Revisar con Aska": te dice qué ajustar y por qué, y aplicas lo que te parezca.',
          'Toca "WhatsApp" (si el proveedor tiene celular), "Copiar mensaje" o "Imprimir o PDF".',
        ],
        tips: [
          'Sugerido = venta diaria × días del proveedor + mínimo − lo que hay, sin pasar del máximo. La venta diaria '
            + 'pesa más la última semana que el mes.',
          'Lo vencido no cuenta como existencia, y lo que vence en 60 días sale marcado.',
          'El proveedor de cada producto es el de su última compra registrada; sin compras sale en "Sin proveedor".',
          'Cuando llegue la mercancía, regístrala como siempre en "Recibir mercancía".',
        ],
        who: 'Quien consulta compras. Cambiar los días necesita recibir mercancía; revisar con Aska necesita XASKA IA.',
      },
      {
        id: 'cargar-factura',
        title: 'Cargar la factura del proveedor (XML, foto o PDF)',
        summary: 'En vez de digitar producto por producto, subes el XML de la factura electrónica, le tomas una foto a '
          + 'la factura en papel o subes su PDF, y XASKA llena la recepción para que la revises. Nada se guarda hasta '
          + 'que tú la registras.',
        steps: [
          'Entra a Compras → Recibir mercancía. Si es factura electrónica, toca "XML" (o "Cargar factura") y elige el '
            + 'ZIP o el XML que te llegó al correo: es exacto y no gasta lecturas.',
          'Si es de papel, toca "Tomar foto" y fotografía la factura completa, derecha y con buena luz. Si es larga, '
            + 'toca "Fotos o PDF" y elige hasta 5 fotos en orden, o el PDF (hasta 10 páginas). Espera: puede tardar '
            + 'hasta un minuto.',
          'Si el proveedor no está en XASKA te lo dice con su NIT: toca "Crear proveedor".',
          'Revisa cada producto. XASKA los encuentra por lo que aprendió de ese proveedor, por el código de barras o por '
            + 'un nombre parecido. Lo que dice "Se eligió por el nombre" confírmalo o cámbialo.',
          'En "Sin producto en XASKA" elige a qué producto corresponde cada línea ("¿Es…?" o "Buscar otro") o márcala '
            + 'como "No lo recibo". Para crear todos los que faltan de una vez toca "Crear los que faltan": revisa '
            + 'nombre, SKU y precio (sale con tu margen) y toca "Crear"; quedan en la recepción con lo que llegó.',
          'Ropa y calzado: marca "Tiene tallas", elige la escala y pon cuántos llegaron de cada talla. Si la factura '
            + 'trae la curva (35×1, 36×2…), Aska ya la llena. Si la referencia ya existe, solo se agregan las tallas '
            + 'nuevas.',
          'Revisa la presentación si la factura viene por caja, anota lote y vencimiento si faltan, rechaza lo que '
            + 'llegó mal y termina como siempre con la revisión técnica y el pago.',
        ],
        tips: [
          'La próxima factura de ese proveedor sale casi sola: XASKA recuerda su código para cada producto.',
          'Si vas digitando a mano, desde la 4.ª línea Aska te ofrece leer la factura con una foto (lo mismo al crear '
            + 'el 3.er producto seguido o si tu inventario está casi en cero). Ciérralo con "Ahora no" o "No volver a '
            + 'mostrar".',
          'Si el costo subió o bajó más de un 25 % frente a la última compra, o si lo cargado no suma lo mismo que la '
            + 'factura, sale un aviso para que lo revises.',
          'La factura queda guardada con la compra: en el detalle toca "Factura del proveedor" para descargarla.',
          'Si la factura trae lote y vencimiento (en su campo o en la descripción), se llenan solos.',
          'La foto o el PDF los lee una inteligencia artificial: casi siempre acierta, pero revisa cada cantidad y '
            + 'costo contra el papel. Si una foto sale borrosa, te avisa y no se descuenta.',
          'La foto y el PDF son parte de XASKA IA, un adicional que se activa aparte del plan. Cada factura leída '
            + 'cuenta una vez en el tope del mes, aunque tenga varias fotos; lo ves en la misma pantalla.',
        ],
        who: 'Quien recibe mercancía, con los permisos "Cargar la factura del proveedor" (el XML) y "Leer con IA la '
          + 'foto o el PDF de la factura". Requiere el plan Negocio o superior y, para la foto o el PDF, XASKA IA.',
      },
      {
        id: 'cuentas-por-pagar',
        title: 'Cuentas por pagar y pagos a proveedores',
        summary: 'Las compras a crédito quedan en Cuentas por pagar con su fecha de vencimiento. Ahí ves cuánto debes, '
          + 'cuánto está vencido y cuánto vence esta semana, y registras cada pago o abono.',
        steps: [
          'Entra a Cuentas por pagar (o en Compras toca "Cuentas por pagar").',
          'Arriba ves lo que debes, lo vencido y lo que vence en los próximos 7 días. Abajo, cada factura con su saldo, '
            + 'primero las que vencen antes.',
          'Toca "Pagar" en la factura, escribe el valor (todo el saldo o un abono), elige el medio y la referencia de '
            + 'la transferencia si la tienes. Toca "Registrar pago".',
        ],
        tips: [
          'Un pago en efectivo sale de tu caja abierta y aparece en su informe como "Pagos a proveedores"; no puede '
            + 'pasar de lo que hay en la caja.',
          'No se puede pagar más que el saldo de la factura.',
          'Cada pago queda en la recepción (quién, cuándo y cómo) y en la auditoría.',
        ],
        who: 'Propietario, Administrador y Contador.',
      },
      {
        id: 'dispensar-formula',
        title: 'Vender medicamentos con fórmula (dispensación)',
        summary: 'Con el módulo Medicamentos, lo que es bajo fórmula médica solo lo vende quien puede dispensar '
          + '(Director técnico, Auxiliar de farmacia, Propietario o Administrador) y confirmando que vio la fórmula. '
          + 'En los antibióticos también se anotan los datos de la fórmula.',
        steps: [
          'Agrega los productos como siempre y toca Cobrar.',
          'Si algo es bajo fórmula, en el cobro sale "Fórmula médica": marca "Vi la fórmula médica y entrego lo que '
            + 'dice". Entrega exactamente lo que dice la fórmula: no la cambies ni recomiendes otro.',
          'Si es un antibiótico (o de control especial), escribe quién firmó la fórmula (y su registro si lo tiene), '
            + 'la fecha de la fórmula y el documento y nombre del paciente.',
          'Cobra como siempre. Todo queda en Reportes → Libro de dispensación, con el lote que salió.',
        ],
        tips: [
          'Un cajero sin permiso de dispensar no puede cobrar algo bajo fórmula: el sistema le pide llamar al director '
            + 'técnico o al auxiliar.',
          'Lo bajo fórmula se vende solo desde Vender (no desde pedidos, cotizaciones ni mesas), porque ahí se confirma.',
          'En el libro filtra "Solo antibióticos" para el reporte de antibióticos dispensados.',
          'Los datos del director técnico se llenan en Ajustes y salen en las actas de baja.',
        ],
        who: 'Director técnico, Auxiliar de farmacia, Propietario y Administrador.',
      },
      {
        id: 'lotes-vencimientos',
        title: 'Lotes y vencimientos (droguerías)',
        summary: 'Los medicamentos, fitoterapéuticos y dispositivos médicos (y lo que marques) se manejan por lote. '
          + 'Al vender sale solo el lote que vence primero, nunca uno vencido, y queda registrado qué lote se vendió.',
        steps: [
          'Los lotes entran con la compra (Recibir mercancía), el saldo inicial, un ajuste de entrada o un conteo: '
            + 'escribe el lote y el vencimiento como vienen en el empaque.',
          'Al vender no haces nada distinto: el sistema descuenta primero lo que no tiene lote (lo de antes) y luego el '
            + 'lote que vence primero. Si solo queda producto vencido, no deja venderlo.',
          'Si anulas una venta, las unidades vuelven a los mismos lotes de los que salieron.',
          'En un ajuste de salida, un traslado o una baja puedes elegir el lote; si no lo eliges sale el que vence '
            + 'primero. Lo vencido no se traslada.',
          'Entra a Inventario → Vencimientos para ver lo vencido, lo que vence en los próximos meses (se cambia en '
            + 'Ajustes → Vencimientos; por defecto 3) y lo que aún no tiene lote.',
        ],
        tips: [
          'Lo que tenías antes de controlar lotes queda como "Sin lote": se vende primero. Para cargarle el lote haz un '
            + 'conteo físico: cuenta cada lote (con "+ Lote nuevo") y deja "Sin lote" en 0.',
          'En la lista de productos y al vender, la marca "Vence pronto" avisa que el lote que sale primero vence '
            + 'dentro del aviso.',
          'El kardex de cada producto muestra el lote de cada movimiento.',
        ],
        who: 'Todos los que venden (automático). Ver Vencimientos: quien consulta inventario.',
      },
      {
        id: 'baja-vencidos',
        title: 'Dar de baja vencidos o averiados (acta)',
        summary: 'Lo vencido, averiado o retirado del mercado se saca del inventario con una baja que deja el acta: '
          + 'motivo, lote, cantidad, valor, cómo se dispuso y testigo.',
        steps: [
          'En Vencimientos toca "Dar de baja" en el lote (o en Movimientos → Baja).',
          'Elige el motivo y escribe cómo se dispuso: el gestor de residuos que lo recogió y el número de su acta. Si '
            + 'alguien lo presenció, escribe su nombre.',
          'Revisa el lote y la cantidad de cada producto y toca "Registrar".',
          'En Movimientos abre la baja y toca "Ver e imprimir acta": imprímela, fírmala y guárdala con el certificado '
            + 'del gestor de residuos.',
        ],
        tips: [
          'Los medicamentos vencidos son residuos peligrosos: no van a la basura común; entrégalos a un gestor autorizado '
            + 'o al programa posconsumo.',
          'Si el proveedor recibe la devolución, mejor usa "Devolver al proveedor" en la compra: así se descuenta de lo '
            + 'que le debes.',
        ],
        who: 'Propietario, Administrador y Bodega (permiso de ajustar inventario).',
      },
      {
        id: 'devolucion-proveedor',
        title: 'Devolver mercancía al proveedor',
        summary: 'Desde una compra puedes devolver lo que llegó mal, vence pronto o fue retirado del mercado. Sale del '
          + 'lote recibido y se descuenta de lo que le debes al proveedor.',
        steps: [
          'Entra a Compras y abre la recepción.',
          'Toca "Devolver al proveedor", escribe cuánto devuelves de cada producto (en la unidad en que llegó) y el motivo.',
          'Toca "Registrar devolución": el saldo de la factura baja en ese valor (con IVA).',
        ],
        tips: [
          'No puedes devolver más de lo que recibiste menos lo ya devuelto.',
          'Si la factura ya estaba pagada, el valor queda a tu favor: pídele al proveedor la nota crédito.',
        ],
        who: 'Propietario, Administrador y Bodega.',
      },
      {
        id: 'temperatura-humedad',
        title: 'Temperatura y humedad',
        summary: 'La planilla que pide la Secretaría de Salud: el local (termohigrómetro) y la nevera de cadena de frío, '
          + 'mañana y tarde. Con el módulo Medicamentos, en Inventario → "Temperatura y calidad".',
        steps: [
          'La primera vez toca "Crear local y nevera" (local de 15 a 30 °C y humedad de 35 a 70 %; nevera de 2 a 8 °C). '
            + 'Los rangos y otros puntos, en "Puntos de control".',
          'Cada mañana escribe la temperatura y la humedad del local y la temperatura de la nevera, y toca "Guardar lectura". '
            + 'Desde las 12 se registra la de la tarde.',
          'Si una lectura sale del rango, escribe qué se hizo (se prendió el aire, se revisó la nevera).',
          'En "Planilla del mes" ves todas las lecturas por día; lo que salió del rango va en rojo con su acción.',
        ],
        tips: [
          'Si falta la lectura de la mañana, o la de la tarde después de las 2, el inicio te lo recuerda.',
          'Las lecturas no se cambian ni se borran. Si anotaste mal, acláralo en la lectura siguiente.',
          'Lo pueden registrar el dueño, el administrador, el director técnico y el auxiliar de farmacia.',
        ],
        who: 'Propietario, Administrador, Director técnico y Auxiliar de farmacia.',
      },
      {
        id: 'eventos-adversos',
        title: 'Eventos adversos',
        summary: 'Cuando un medicamento le hace daño a un paciente, la droguería lo reporta al INVIMA (formato FOREAM). '
          + 'Aquí queda el registro y el seguimiento.',
        steps: [
          'En "Temperatura y calidad" → "Eventos adversos" toca "Registrar evento".',
          'Escribe la fecha, el medicamento (y su lote si lo sabes), el paciente y qué le pasó; marca si es grave.',
          'Repórtalo en la página del INVIMA y después toca "Anotar reporte" con la fecha y el número que te dieron.',
        ],
        tips: [
          'Los que faltan por reportar salen en rojo, aquí y en el informe para la visita.',
          'Son datos de salud: solo los ven quienes tienen el permiso de calidad.',
        ],
        who: 'Propietario, Administrador, Director técnico y Auxiliar de farmacia.',
      },
      {
        id: 'informe-visita',
        title: 'Informe para la visita de la Secretaría',
        summary: 'Un documento en hoja carta con lo que la inspección revisa de un periodo, listo para imprimir o guardar en PDF.',
        steps: [
          'En "Temperatura y calidad" toca "Informe para la visita".',
          'Elige las fechas (por defecto el mes actual).',
          'Toca "Imprimir o guardar PDF". Para el PDF, elige "Guardar como PDF" como impresora.',
        ],
        tips: [
          'Trae el director técnico, la planilla de temperatura (lo que faltó y lo que salió del rango), vencidos y por '
            + 'vencer, actas de baja, recepciones técnicas, antibióticos dispensados y eventos adversos.',
          'Revísalo unos días antes de la visita: lo que falta sale resaltado para corregirlo a tiempo.',
        ],
        who: 'Propietario, Administrador, Director técnico y Auxiliar de farmacia.',
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
        id: 'gastos',
        title: 'Gastos del negocio',
        summary: 'Anota todo lo que paga el negocio para funcionar (arriendo, servicios, nómina, transporte, arreglos) y '
          + 'mira en qué se va la plata. Cada gasto lleva una categoría; puede salir del efectivo de la caja o pagarse '
          + 'por banco, Nequi, Bre-B o tarjeta.',
        table: {
          headers: ['Cómo se pagó', 'Dónde se registra y qué pasa con la caja'],
          rows: [
            ['En efectivo', 'En "Mi caja", con el botón "Egreso". Sale de tu caja abierta y aparece en su cierre como '
              + 'egreso.'],
            ['Por banco, Nequi, Bre-B o tarjeta', 'En Gastos, con "Registrar gasto". No toca la caja y puedes ponerle '
              + 'la fecha en que lo pagaste.'],
          ],
        },
        steps: [
          'Entra a Gastos y toca "Registrar gasto".',
          'Escribe cuánto fue y elige en qué se gastó y con qué se pagó.',
          'Si no fue en efectivo, elige la sede y la fecha. La referencia, el proveedor, la nota y la foto o el PDF del '
            + 'recibo son opcionales.',
          'Toca "Registrar gasto". Arriba ves cuánto gastaste en el periodo y, en "En qué se fue la plata", el total de '
            + 'cada categoría; toca una para ver solo sus gastos.',
          'Con "Exportar" bajas el listado para Excel.',
        ],
        tips: [
          'Categorías: con el botón "Categorías" agregas las tuyas, las renombras o apagas las que no uses. Una '
            + 'apagada deja de ofrecerse, pero los gastos que la usaron la conservan.',
          'Sin clasificar: los egresos de caja de antes no tenían categoría. Aparecen como "Sin clasificar"; toca '
            + '"Clasificar" para ponérsela. Eso no mueve otra vez la caja.',
          'Corregir: puedes cambiar la categoría, el proveedor, la nota y la fecha. El valor y el medio de pago no se '
            + 'cambian: si te equivocaste, anula el gasto y regístralo de nuevo.',
          'Anular: pide el motivo y el gasto deja de sumar. Si salió de una caja, el efectivo vuelve a ella, y por eso '
            + 'solo se puede anular mientras esa caja siga abierta.',
          'La mercancía que les compras a los proveedores no va aquí: se registra en Compras, porque ya cuenta como '
            + 'costo de lo que vendes.',
          'Un retiro de caja (sacar plata para guardarla o consignarla) tampoco es un gasto.',
        ],
        who: 'Propietario, Administrador y Contador ven y registran gastos (permisos "Ver los gastos" y "Registrar, '
          + 'corregir y anular gastos"). Quien opera una caja registra el gasto en efectivo de su caja.',
      },
      {
        id: 'tablero-finanzas',
        title: 'Finanzas: el mes de un vistazo',
        summary: 'La pantalla Finanzas junta lo importante del mes en curso, pensado para leerlo en el celular: cuánto '
          + 'vas ganando, cuánto necesitas vender al día, lo que te deben, lo que debes, tus gastos y la plata que entró '
          + 'y salió por cada medio de pago.',
        table: {
          headers: ['Parte', 'Qué te dice'],
          rows: [
            ['Vas ganando', 'Ventas sin IVA menos el costo de lo vendido menos los gastos del mes, hasta hoy.'],
            ['Cuánto necesitas vender', 'Punto de equilibrio: tus gastos del mes pasado (o tus gastos fijos, si no hay) '
              + 'divididos por lo que te deja cada venta (margen de los últimos 30 días), repartidos en los días del '
              + 'mes. La barra compara lo que llevas con la meta a hoy.'],
            ['Te deben', 'Lo que deben en fiados y lo que falta por cobrar de los pedidos abiertos, a hoy.'],
            ['Debes a proveedores', 'Las cuentas por pagar: el total, lo vencido y lo que vence esta semana.'],
            ['Gastos del mes', 'Lo gastado hasta hoy frente a los mismos días del mes anterior, y los más grandes.'],
            ['Plata que entró y salió', 'Por medio de pago: entró por ventas, abonos de fiado y anticipos; salió por '
              + 'gastos y pagos a proveedores.'],
          ],
        },
        tips: [
          'El fiado y la retención no son plata que entra: no salen en "entró" hasta que el cliente paga.',
          'Es de todo el negocio (todas las sedes). Para ver una sede, usa el Estado de resultados.',
        ],
        who: 'Propietario, Administrador y Contador.',
      },
      {
        id: 'estado-de-resultados',
        title: 'Estado de resultados: cuánto ganaste',
        summary: 'Junta lo que vendiste, lo que te costó y lo que gastaste para decirte si ganaste o perdiste en el mes '
          + '(o en el rango que elijas), comparado con el mes anterior y con el mismo mes del año pasado.',
        table: {
          headers: ['Renglón', 'Qué es'],
          rows: [
            ['Ventas', 'Lo que vendiste, sin el IVA (el IVA es de la DIAN). Las ventas anuladas no cuentan.'],
            ['Costo de lo vendido', 'Lo que te costó la mercancía que vendiste, con el costo promedio de cada producto.'],
            ['Utilidad bruta', 'Ventas menos costo: lo que te deja vender, antes de pagar los gastos.'],
            ['Gastos', 'Lo registrado en Gastos en el periodo, por categoría (también los sin clasificar).'],
            ['Utilidad operativa', 'Utilidad bruta menos gastos: lo que ganaste (o perdiste).'],
          ],
        },
        steps: [
          'Entra a Estado de resultados (menú Reportes). Por defecto muestra el mes actual; elige "Mes anterior" o un '
            + 'rango, y la sede si tienes varias.',
          'Arriba ves lo que vendiste, lo que te quedó y lo que ganaste; debajo, la explicación en palabras.',
          'En la tabla, cada renglón con la variación frente al periodo anterior y al año pasado (si hay datos).',
          '"PDF" abre la hoja carta con tu logo para imprimir o guardar como PDF; "Excel" baja la tabla.',
        ],
        tips: [
          'El IVA cobrado y las retenciones que te hicieron salen aparte: no son ingresos ni gastos del negocio.',
          'Si hay gastos fijos del periodo sin pagar, sale un aviso con cuánto falta; no se restan hasta que los pagues.',
          'Si un producto no tiene costo, su costo cuenta como cero y la utilidad sale más alta: revisa los costos en '
            + 'Productos.',
          'Es una guía con lo registrado en XASKA; no reemplaza los estados financieros de tu contador.',
        ],
        who: 'Propietario, Administrador y Contador (permiso "Ver las retenciones (y las finanzas del negocio)").',
      },
      {
        id: 'retenciones',
        title: 'Retenciones: cuando el cliente te retiene al pagar',
        summary: 'Algunas empresas (por ejemplo, una constructora que te compra) te pagan menos porque retienen una parte '
          + 'para la DIAN o el municipio: retefuente, reteICA o reteIVA. Esa plata no se pierde: ellos la pagan a tu '
          + 'nombre y tú la descuentas al declarar con el certificado que te dan. XASKA la registra para que la venta o '
          + 'el pedido queden pagos, sin deuda del cliente ni faltante en la caja.',
        steps: [
          'Al cobrar (en Vender, al vender una cotización, o en el abono o la entrega de un pedido) elige el cliente y '
            + 'toca "El cliente retuvo".',
          'Si el cliente tiene sus retenciones en la ficha, aparecen listas con su tarifa. Retefuente y reteICA se '
            + 'calculan sobre el valor sin IVA; reteIVA, sobre el IVA.',
          'XASKA resta lo retenido de lo que el cliente paga: cobra solo el resto con efectivo, transferencia u otro '
            + 'medio, y registra.',
          'En un abono de pedido escribe lo que de verdad te pagaron: XASKA calcula el abono completo (pagado más '
            + 'retenido).',
          'En Retenciones ves cuánto te retuvieron en el periodo, por tipo y por cliente. Cuando llegue el '
            + 'certificado, toca "Llegó el certificado" en ese cliente. Con "Exportar" lo bajas para tu contador.',
        ],
        tips: [
          'Retenciones habituales: en Clientes, toca "Retenciones" en el cliente y marca las que siempre te hace con '
            + 'su tarifa (por ejemplo, retefuente 6 %). ReteICA en porcentaje: 9,66 por mil es 0,966 %.',
          'El cajero solo puede aplicar las retenciones de la ficha del cliente, con su tarifa y la base que calcula '
            + 'XASKA. Retenciones a otros clientes, o con otra tarifa o base, las registra quien tiene el permiso de '
            + 'finanzas.',
          'Si anulas la venta, su retención deja de sumar. Si cancelas un pedido con abonos retenidos, primero se '
            + 'reversa lo retenido y solo se devuelve el resto.',
          'La venta conserva su valor completo: la retención no es un descuento.',
        ],
        who: 'Cobra con retención quien vende o recibe abonos. Ven el reporte y marcan certificados Propietario, '
          + 'Administrador y Contador (permisos "Ver las retenciones" y "Registrar cualquier retención…").',
      },
      {
        id: 'gastos-fijos',
        title: 'Gastos fijos: arriendo, nómina, servicios',
        summary: 'Lo que pagas siempre (el arriendo cada mes, la nómina cada quincena) lo creas una vez como gasto fijo. '
          + 'XASKA te avisa cuando toca, en Gastos y en Inicio, y lo registras con un toque.',
        steps: [
          'En Gastos toca "Gastos fijos" y luego "Nuevo gasto fijo".',
          'Escribe el nombre y el valor de cada pago, y elige cada cuánto se paga: cada mes (un día, por ejemplo el 5) '
            + 'o cada quincena (el 15 y el último día del mes).',
          'Elige la categoría, con qué lo pagas normalmente, la sede y desde cuándo. Toca "Crear gasto fijo".',
          'Desde una semana antes de cada fecha aparece en "Por pagar" (arriba en Gastos) y en Inicio. Toca "Pagar": '
            + 'todo viene listo y puedes cambiar el valor, el medio, la fecha o subir el recibo. Toca "Registrar pago".',
        ],
        tips: [
          'Si un mes no se paga (por ejemplo, no hubo nómina extra), toca "Este mes no" ("Esta quincena no" en los '
            + 'quincenales). Si te equivocaste, toca "Deshacer".',
          'Si pones una fecha de inicio en el pasado, te muestra lo que quedó sin pagar (hasta 3 meses atrás).',
          'En los meses cortos, un gasto del día 31 se avisa el último día del mes.',
          'Si anulas el gasto de un pago, esa fecha vuelve a quedar por pagar.',
          'Para dejar de recibir avisos, apágalo en "Gastos fijos". Lo que ya pagaste sigue en Gastos.',
        ],
        who: 'Lo ven quienes ven los gastos; lo crean, lo pagan y lo saltan Propietario, Administrador y Contador.',
      },
      {
        id: 'pregunta-ia',
        title: 'Pregúntale a Aska, la IA de XASKA',
        summary: 'Escribe una pregunta como "¿cuánto vendí hoy?" o "¿qué se me vence este mes?" y Aska la responde '
          + 'con tus reportes, con las cifras clave resaltadas. Solo consulta: nunca cambia nada.',
        steps: [
          'Toca el botón de Aska (el ícono IA índigo con la chispa), abajo a la derecha, desde cualquier pantalla.',
          'Escribe tu pregunta o toca uno de los ejemplos, y espera unos segundos.',
          'Sigue preguntando sobre lo mismo ("¿y la semana pasada?") o toca una de las preguntas que Aska te propone. '
            + 'Con "Nueva conversación" empiezas otra.',
        ],
        tips: [
          'Responde sobre ventas, productos, inventario y vencimientos, fiados, cuentas por pagar, cajas y finanzas: '
            + 'gastos, cuánto ganaste (estado de resultados), el punto de equilibrio y las retenciones.',
          'En la prueba gratis de 14 días, arriba verás cuántos días te quedan: tócalo para ver los tres retos (leer una '
            + 'factura, preguntar qué se agota y cargar tu cuaderno), que se marcan solos al hacerlos.',
          'Cada usuario solo recibe respuestas de lo que su rol le deja ver: un cajero no ve la utilidad del negocio.',
          'Debajo de cada respuesta dice qué consultó. Revisa en Reportes las cifras importantes antes de decidir.',
          'La conversación se borra al cerrar el panel: XASKA no guarda lo que preguntas, solo cuenta cuántas preguntas '
            + 'van en el mes.',
        ],
        who: 'Todos los roles menos el Mesero, en negocios con el adicional XASKA IA.',
      },
      {
        id: 'resumen-del-dia',
        title: 'Resumen del día de Aska',
        summary: 'Cada día, a la hora que elijas, Aska te escribe cómo le fue al negocio: ventas frente a ayer y a la '
          + 'semana pasada, caja, inventario y lo que hay por cobrar o pagar. Llega por correo y queda arriba en Inicio.',
        steps: [
          'Entra a Ajustes → Resumen del día. Déjalo prendido y elige la hora (9:00 p. m. por defecto).',
          'Marca quién más del equipo lo recibe por correo. Tú, como propietario, siempre lo recibes.',
          'Toca "Enviar ahora" para ver uno de prueba con lo que va del día.',
        ],
        tips: [
          'Si eliges una hora antes del mediodía (por ejemplo 6:00 a. m.), el resumen es del día anterior.',
          'El clima resume tu día: ☀️ vendiste igual o más que el mismo día de la semana pasada, ⛅ un poco menos, '
            + '🌧️ bastante menos y ⛈️ hay algo urgente (un descuadre, un agotado, una factura vencida).',
          'Abajo viene el pronóstico de mañana, según cómo te ha ido ese día en las últimas semanas.',
          'Cada persona solo ve lo que su rol le deja ver: un cajero no recibe las ventas ni la utilidad.',
          'Toca una de las preguntas del correo o de la tarjeta en Inicio y Aska te la responde de una vez.',
          'El día 1 de cada mes, al dueño le llega "Lo que hiciste con Aska": las facturas que leyó, los productos que '
            + 'cargó, las preguntas y el tiempo que te ahorró (también en Inicio la primera semana del mes).',
          'Quien ve los gastos recibe también los del día, la ganancia del día ya descontándolos y los gastos fijos '
            + 'vencidos o que vencen mañana. El correo del día 1 trae además cuánto ganaste el mes pasado y tus gastos '
            + 'más grandes, con el enlace al Estado de resultados.',
        ],
        who: 'El propietario y quien él elija, en negocios con el adicional XASKA IA.',
      },
      {
        id: 'aska-finanzas',
        title: 'Aska y tus finanzas: leer recibos y preguntar cuánto ganaste',
        summary: 'Con XASKA IA, Aska llena el gasto con la foto del recibo y responde preguntas de plata: cuánto '
          + 'gastaste, cuánto ganaste, cuánto necesitas vender y qué retenciones te hicieron.',
        steps: [
          'Al registrar un gasto (en Gastos o con "Egreso" en Mi caja) toca "Leer con Aska" y tómale foto al recibo o '
            + 'sube el PDF.',
          'Aska llena el valor, la fecha, la categoría, el proveedor (si ya está creado), la referencia y la nota. '
            + 'Revisa lo que dice en los avisos y corrige lo que haga falta.',
          'Toca "Registrar gasto": la foto queda guardada como soporte del gasto.',
          'Para preguntar, abre Aska y escribe, por ejemplo: "¿Cuánto gané este mes?", "¿En qué se me fue la plata?", '
            + '"¿Cuánto tengo que vender al día?" o "¿Qué retenciones me hicieron?".',
        ],
        tips: [
          'Leer recibos tiene su propio tope al mes (100; 10 en la prueba gratis). Si Aska no puede leerlo, no se descuenta.',
          'En Mi caja el gasto queda con la fecha de hoy aunque el recibo diga otra, y el proveedor va en la nota.',
          'Si la fecha del recibo es futura, casi siempre es la fecha límite de pago: Aska no la pone y te avisa.',
          'Aska solo responde lo que tu rol deja ver: los gastos con permiso de ver gastos; el estado de resultados, el '
            + 'tablero y las retenciones con permiso de ver finanzas.',
        ],
        who: 'Quien registra gastos (Propietario, Administrador, Contador y el cajero en su caja), con XASKA IA.',
      },
      {
        id: 'invita-y-gana',
        title: 'Invita y gana: un mes de XASKA IA por cada negocio',
        summary: 'Comparte tu código con otros negocios. Cuando uno entre con él y pague su primer mes, te regalamos un '
          + 'mes de XASKA IA. Tu invitado prueba 14 días gratis con la IA incluida.',
        steps: [
          'Entra a Ajustes → Planes y pagos y busca "Invita y gana": ahí está tu código.',
          'Toca "Compartir por WhatsApp" (el mensaje ya va con tu enlace) o "Copiar enlace".',
          'Tu invitado se registra con el enlace; si lo escribe a mano, va en "Código de invitación" al crear su negocio.',
          'Cuando pague su primer mes, te llega un correo y tu mes de XASKA IA queda activo.',
        ],
        tips: [
          'No hay límite: cada negocio que pague te da otro mes, que se suma al que ya tengas.',
          'Abajo ves a quién invitaste y quién ya pagó.',
          'Tu propio código no sirve para crear otro negocio tuyo.',
        ],
        who: 'El propietario del negocio.',
      },
      {
        id: 'planes-y-pagos',
        title: 'Planes y pagos con Bre-B',
        summary: 'Renueva tu plan, cámbialo, agrega XASKA IA, módulos o más sedes, cajas y usuarios, y paga por Bre-B '
          + 'desde la app de tu banco o billetera. Sin datáfono ni tarjeta.',
        steps: [
          'Toca la píldora de tu plan arriba, junto al nombre del negocio (o Ajustes → Planes y pagos).',
          'Elige mensual o anual, el plan y los adicionales. Abajo ves el total; toca "Pagar con Bre-B".',
          'En la app de tu banco envía el valor exacto a la llave de XASKA y escribe la referencia (XK…) en la descripción.',
          'Toca "Ya pagué: subir el comprobante" y elige la foto o el PDF. Aska lo revisa y XASKA lo aprueba; te avisamos '
            + 'por correo. Si tenías la app abierta, sal y vuelve a entrar para ver lo nuevo.',
        ],
        tips: [
          'XASKA IA se puede probar gratis 14 días, una sola vez por negocio, con topes más bajos.',
          'Lo que compras aparte vence por su cuenta; al renovar se suma desde el vencimiento.',
          'Si pagas desde otro celular, escanea el QR de la pantalla de pago y escribe el valor y la referencia.',
        ],
        who: 'El dueño y quien tenga permiso de cambiar los ajustes del negocio.',
      },
      {
        id: 'cargar-con-aska',
        title: 'Cargar el catálogo con Aska',
        summary: 'Sube la lista de precios que te mandó el proveedor (Excel, PDF o fotos) y Aska crea los productos nuevos '
          + 'y pone al día costos y precios de los que ya tienes. Nada se guarda hasta que lo revises.',
        steps: [
          'En Productos toca "Cargar con Aska" y elige la lista. Escoge el proveedor y el margen para los productos nuevos.',
          'Toca "Leer con Aska". Verás cada fila marcada como Nueva, Cambia o Sin cambios.',
          'Corrige lo que quieras (nombre, SKU, categoría, costo, precio) y desmarca lo que no quieras guardar.',
          'Toca "Guardar": se guarda todo o nada.',
        ],
        tips: [
          '¿Tu inventario está en un cuaderno? Elige "Mi inventario" (o en Existencias, "Cargar inventario con Aska"), '
            + 'tómale foto a cada hoja (hasta 10) o sube un Word con las fotos, y elige la sede. Si el Word trae más de '
            + '10, Aska los lee por tandas: guardas y tocas "Seguir con las fotos 11 a 20".',
          'Si la lista o el cuaderno no trae precios, Aska saca igual los productos: escribe el precio de cada uno en '
            + 'la revisión (o 0 si aún no lo sabes).',
          'Los productos que ya tienes conservan su margen: si el costo sube, el precio sube igual. Si baja, el precio se queda.',
          'Si el producto ya tiene movimientos, su costo lo pone el inventario con la próxima compra; aquí se ajusta el precio.',
          'Con el proveedor elegido, Aska recuerda sus códigos para la próxima lista y la próxima factura.',
        ],
        who: 'Quien administra productos, en negocios con el adicional XASKA IA.',
      },
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
          'Encabezado de los documentos: lo que sale debajo del nombre del negocio en tiquetes, pedidos, cotizaciones e informes de caja. Escribe un dato por renglón y en el orden que quieras (por ejemplo NIT, dirección y celular). Si lo dejas vacío, sale la dirección y el teléfono de la sede.',
          'Pie del recibo: el texto que sale al final de cada tiquete.',
          'Enviarme el resumen de cada cierre de caja: llega al correo del dueño cada vez que se cierra una caja.',
          'Marca: sube tu logo (sale en el encabezado y en el tiquete) y elige el color de la app entre los de la paleta; toca un color para verlo antes de guardarlo.',
        ],
        who: 'Para cambiarlos: Propietario y Administrador.',
      },
      {
        id: 'planes',
        title: 'Tu plan y lo que incluye',
        summary: 'Emprende, Negocio o Empresa. En Ajustes → Suscripción ves tu plan, lo que incluye, cuántas sedes, cajas '
          + 'y usuarios usas y cómo pagar.',
        steps: [
          'Emprende: vender, caja, inventario, fiado y reportes; 1 sede, 1 caja y 2 usuarios.',
          'Negocio: además pedidos, cotizaciones, tallas, báscula, compras, impresión directa y el módulo de tu sector '
            + '(mesas y cocina o droguería); 1 sede, 3 cajas y 6 usuarios.',
          'Empresa: todo, con auditoría, caja por zona y traslados; hasta 5 sedes, cajas y usuarios sin límite.',
        ],
        tips: [
          'Lo que no incluye tu plan sale en gris en "Tipo de negocio y módulos". Para tenerlo, escríbenos.',
          'XASKA te puede dar, por acuerdo, un módulo, una caja o un usuario de más sin cambiar de plan.',
          'Si ya eras cliente antes de estos planes, conservas lo que tienes y tu precio por 12 meses.',
        ],
        who: 'Lo ve el dueño y quien tiene acceso a Ajustes.',
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
