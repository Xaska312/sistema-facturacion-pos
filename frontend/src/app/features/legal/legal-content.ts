/**
 * Términos y Condiciones y Política de Tratamiento de Datos Personales de XASKA POS (fase 9a, decisión 250).
 * Mismo texto que el documento de revisión legal. Antes de abrir a clientes:
 * 1. Llena LEGAL_OWNER (cédula, dirección, ciudad, teléfono, fecha) y los [PENDIENTES] del texto.
 * 2. Si cambias el fondo de un texto, sube su versión aquí Y en LegalConsentService.java (backend): la app vuelve a
 *    pedir la aceptación a todos.
 */
export const TERMS_VERSION = '1.1';
export const PRIVACY_VERSION = '1.1';

/** Datos del responsable (persona natural con la marca XASKA). */
export const LEGAL_OWNER = {
  name: 'Daniel Mejía',
  idNumber: '[CÉDULA]',
  city: '[CIUDAD]',
  address: '[DIRECCIÓN]',
  phone: '[TELÉFONO]',
  email: 'soporte@xaska.co',
  publishedOn: '[FECHA DE PUBLICACIÓN]',
  hosting: '[PROVEEDOR: Contabo (Estados Unidos) o Hetzner (Alemania)]',
} as const;

export interface LegalBlock {
  /** Párrafo. */
  p?: string;
  /** Lista de puntos (o numerada con {@code ordered}). */
  list?: readonly string[];
  ordered?: boolean;
}

export interface LegalSection {
  id: string;
  title: string;
  blocks: readonly LegalBlock[];
}

export type LegalKind = 'terminos' | 'privacidad';

export interface LegalDocument {
  kind: LegalKind;
  title: string;
  version: string;
  intro: string;
  sections: readonly LegalSection[];
}

const O = LEGAL_OWNER;

export const PRIVACY_POLICY: LegalDocument = {
  kind: 'privacidad',
  title: 'Política de Tratamiento de Datos Personales',
  version: PRIVACY_VERSION,
  intro: `Versión ${PRIVACY_VERSION} · vigente desde ${O.publishedOn}. Esta política cumple la Ley 1581 de 2012 y el `
    + 'Decreto 1074 de 2015 (que recoge el Decreto 1377 de 2013).',
  sections: [
    {
      id: 'responsable',
      title: '1. Quién es el responsable',
      blocks: [{
        p: `${O.name}, persona natural, cédula ${O.idNumber}, que ofrece el servicio XASKA POS con la marca XASKA. `
          + `Domicilio: ${O.city}, Colombia. Dirección: ${O.address}. Correo: ${O.email}. Teléfono: ${O.phone}. `
          + 'Sitio: xaska.co.',
      }],
    },
    {
      id: 'datos',
      title: '2. Qué datos tratamos',
      blocks: [
        {
          list: [
            'De quienes crean una cuenta o son invitados: nombre, correo, contraseña (guardada solo como huella cifrada, '
              + 'nunca en texto), negocio y rol.',
            'De seguridad: dirección IP, navegador, fecha y hora de inicios de sesión, intentos fallidos y cambios '
              + 'importantes (registro de auditoría).',
            'Del negocio que contrata: nombre, NIT o cédula, dirección, logo, plan y pagos del servicio.',
            'Que cada negocio registra de sus propios clientes y proveedores (nombre, documento, teléfono, correo, '
              + 'dirección, compras): de estos datos el responsable es el negocio; XASKA solo los guarda y procesa por '
              + 'su cuenta, como encargado (numeral 8).',
          ],
        },
        {
          p: 'No pedimos datos sensibles ni datos de niños, niñas o adolescentes. El servicio es para mayores de 18 años.',
        },
      ],
    },
    {
      id: 'finalidades',
      title: '3. Para qué los usamos',
      blocks: [
        {
          ordered: true,
          list: [
            'Crear y mantener la cuenta, iniciar sesión y dar acceso a cada persona según su rol.',
            'Prestar el servicio: ventas, caja, inventario, reportes y copias de seguridad.',
            'Enviar correos necesarios: confirmar el correo, invitaciones, recuperar la contraseña, avisos de seguridad, '
              + 'del plan y de vencimiento.',
            'Proteger la cuenta y el servicio: detectar accesos indebidos, limitar intentos y llevar el registro de '
              + 'auditoría.',
            'Cobrar el servicio y cumplir obligaciones legales y contables.',
            'Atender soporte, consultas y reclamos.',
          ],
        },
        {
          p: 'No vendemos ni alquilamos datos personales y no los usamos para publicidad de terceros. Si un día enviamos '
            + 'novedades de XASKA, será solo con una autorización aparte que se puede retirar en cualquier momento.',
        },
      ],
    },
    {
      id: 'derechos',
      title: '4. Tus derechos',
      blocks: [
        { p: 'Como titular puedes, gratis:' },
        {
          list: [
            'Conocer, actualizar y rectificar tus datos.',
            'Pedir prueba de la autorización que diste.',
            'Saber cómo se han usado tus datos.',
            'Revocar la autorización o pedir que se borren, cuando no exista un deber legal o contractual de conservarlos.',
            'Presentar quejas ante la Superintendencia de Industria y Comercio (SIC), después de haber hecho la consulta '
              + 'o el reclamo ante nosotros.',
          ],
        },
        { p: 'Puedes consultar tus datos gratis al menos una vez al mes y cada vez que esta política cambie de fondo.' },
      ],
    },
    {
      id: 'procedimiento',
      title: '5. Cómo ejercerlos',
      blocks: [
        {
          p: `Escribe a ${O.email} con tu nombre, el correo de la cuenta, qué pides y una forma de contactarte. `
            + `Atiende ${O.name}.`,
        },
        {
          list: [
            'Consultas (qué datos tenemos y cómo los usamos): respuesta en máximo 10 días hábiles. Si no alcanzamos, te '
              + 'avisamos el motivo y respondemos en máximo 5 días hábiles más.',
            'Reclamos (corregir, actualizar, borrar, revocar o reportar un incumplimiento): respuesta en máximo 15 días '
              + 'hábiles, ampliables 8 días hábiles más con aviso. Si falta información, te la pedimos dentro de los 5 '
              + 'días siguientes; si pasan 2 meses sin respuesta, se entiende que desististe.',
          ],
        },
        {
          p: 'Para datos de clientes de un negocio que usa XASKA POS, la solicitud va primero al negocio, que es el '
            + 'responsable; si nos llega a nosotros, se la pasamos y le ayudamos a atenderla.',
        },
      ],
    },
    {
      id: 'proveedores',
      title: '6. Quién nos ayuda a prestar el servicio',
      blocks: [
        { p: 'Compartimos datos solo con proveedores que los procesan por nuestra cuenta y bajo confidencialidad:' },
        {
          list: [
            `Alojamiento del servidor: ${O.hosting}.`,
            'Envío de correos: Google (Gmail) durante el piloto y después Resend.',
            'Copias de seguridad cifradas: Google Drive.',
          ],
        },
        {
          p: 'Esos servidores están fuera de Colombia. Estados Unidos y Alemania están en la lista de países con nivel '
            + 'adecuado de protección de la SIC (Circular Externa 005 de 2017). Al aceptar esta política autorizas esa '
            + 'transmisión internacional.',
        },
        { p: 'Solo entregamos datos a una autoridad cuando una ley o una orden judicial lo exige.' },
      ],
    },
    {
      id: 'seguridad',
      title: '7. Seguridad y conservación',
      blocks: [
        {
          p: 'Las conexiones van cifradas (HTTPS), las contraseñas se guardan como huella, cada negocio tiene sus datos '
            + 'separados y las copias de seguridad están cifradas. Ningún sistema es 100 % seguro: si ocurre un '
            + 'incidente que afecte tus datos, te avisaremos y lo informaremos a la SIC como pide la ley.',
        },
        {
          p: 'Guardamos los datos mientras la cuenta esté activa. Si el dueño cierra el negocio, los datos quedan '
            + 'desactivados 30 días para recuperarlos o exportarlos. Después se borran de la base activa, y las copias '
            + 'de seguridad cifradas se eliminan solas a medida que vencen (máximo 13 meses). Los registros de pagos y '
            + 'de seguridad se conservan el tiempo que exijan las normas contables y para atender reclamos.',
        },
      ],
    },
    {
      id: 'encargado',
      title: '8. Datos que los negocios cargan (XASKA como encargado)',
      blocks: [{
        p: 'Cada negocio es responsable de los datos de sus clientes, proveedores y empleados que registra en XASKA '
          + 'POS: debe tener su propia autorización y atender a esos titulares. XASKA los trata solo para prestar el '
          + 'servicio y según las instrucciones del negocio, los mantiene seguros y confidenciales, no los usa para '
          + 'nada más y los borra o entrega cuando el contrato termina. Estas reglas son el contrato de transmisión '
          + 'entre el negocio y XASKA y hacen parte de los Términos. El negocio cliente se obliga a mantener indemne a '
          + 'XASKA frente a cualquier investigación, queja o sanción impuesta por la Superintendencia de Industria y '
          + 'Comercio (SIC) originada por la recolección indebida o falta de autorización previa, expresa e informada '
          + 'de los datos personales de sus propios clientes finales.',
      }],
    },
    {
      id: 'cookies',
      title: '9. Cookies y almacenamiento del navegador',
      blocks: [{
        p: 'Usamos una cookie necesaria para mantener la sesión (no se puede leer desde la página) y guardamos en el '
          + 'navegador preferencias como el modo oscuro y el logo del negocio. No usamos cookies de publicidad ni de '
          + 'seguimiento de terceros.',
      }],
    },
    {
      id: 'cambios',
      title: '10. Cambios y vigencia',
      blocks: [{
        p: 'Si cambiamos esta política de fondo, te avisaremos por correo o en la app antes de aplicarla y te pediremos '
          + 'aceptarla de nuevo. Las bases de datos estarán vigentes mientras se presta el servicio y durante los '
          + 'plazos del numeral 7.',
      }],
    },
  ],
};

export const TERMS: LegalDocument = {
  kind: 'terminos',
  title: 'Términos y Condiciones de Uso',
  version: TERMS_VERSION,
  intro: `Versión ${TERMS_VERSION} · vigentes desde ${O.publishedOn}. Al crear una cuenta o usar XASKA POS aceptas `
    + 'estos términos y la Política de Tratamiento de Datos Personales.',
  sections: [
    {
      id: 'servicio',
      title: '1. Quiénes somos y qué ofrecemos',
      blocks: [{
        p: `XASKA POS es un punto de venta e inventario en la nube para negocios, ofrecido por ${O.name} (marca `
          + `XASKA), cédula ${O.idNumber}, ${O.city}, Colombia, ${O.email}. Incluye ventas, caja, inventario, reportes, `
          + 'usuarios con roles y copias de seguridad, según el plan.',
      }],
    },
    {
      id: 'cuenta',
      title: '2. Cuenta y usuarios',
      blocks: [{
        list: [
          'Para registrarte debes ser mayor de 18 años y dar datos ciertos.',
          'Cuidas tu contraseña; lo hecho con tu cuenta se entiende hecho por ti.',
          'El dueño del negocio decide a quién invita y con qué rol, y responde por lo que hacen sus usuarios.',
          `Avísanos pronto a ${O.email} si crees que alguien entró a tu cuenta sin permiso.`,
        ],
      }],
    },
    {
      id: 'planes',
      title: '3. Planes, prueba y pagos',
      blocks: [{
        list: [
          'Hay planes Básico y Pro, mensuales o anuales. Precios vigentes: [PRECIOS]. Los cambios de precio se avisan '
            + 'con al menos 30 días y aplican desde el siguiente periodo.',
          'La prueba gratis se activa con un código que entrega XASKA y dura lo que diga el código.',
          'El pago se hace por adelantado, con las instrucciones que muestra la app. [ACLARAR SI LOS PRECIOS INCLUYEN IVA.]',
          'Si el plan vence, hay 3 días de gracia. Después la cuenta queda en solo consulta: puedes ver y exportar tus '
            + 'datos y cerrar la caja, pero no registrar ventas nuevas hasta pagar. Esta restricción no limita tu acceso '
            + 'a la información de tu negocio: la puedes consultar y exportar mientras la cuenta exista.',
          'Lo pagado por un periodo no se devuelve si cancelas antes de que termine, salvo lo que diga la ley.',
        ],
      }],
    },
    {
      id: 'datos',
      title: '4. Tus datos y los de tus clientes',
      blocks: [{
        list: [
          'La información de tu negocio es tuya. Puedes exportarla en cualquier momento mientras la cuenta exista.',
          'De los datos personales de tus clientes, proveedores y empleados que registras, tú eres el responsable ante '
            + 'la Ley 1581 de 2012: debes tener su autorización y atender sus solicitudes.',
          'XASKA actúa como encargado: los trata solo para prestarte el servicio, los protege, los mantiene '
            + 'confidenciales y no los usa para nada más (numeral 8 de la Política). Este numeral es el contrato de '
            + 'transmisión entre tú y XASKA.',
        ],
      }],
    },
    {
      id: 'uso',
      title: '5. Uso permitido',
      blocks: [{
        p: 'No puedes usar XASKA POS para actividades ilegales, intentar entrar a cuentas o negocios ajenos, '
          + 'sobrecargar o atacar el servicio, copiarlo o revenderlo sin permiso. Si pasa, podemos suspender la cuenta.',
      }],
    },
    {
      id: 'facturacion',
      title: '6. Facturación, impuestos y alcance del software',
      blocks: [
        {
          p: 'XASKA POS provee el software para el registro interno de ventas e inventario. XASKA no es un Proveedor '
            + 'Tecnológico autorizado por la Unidad Administrativa Especial Dirección de Impuestos y Aduanas Nacionales '
            + '(DIAN) para la validación previa de Factura Electrónica.',
        },
        {
          p: 'Límites del tiquete POS: el tiquete generado por el sistema es un comprobante de control interno. En '
            + 'cumplimiento de la normativa colombiana (Resolución 000165 de 2023 y normas concordantes), es exclusiva '
            + 'responsabilidad del titular del negocio determinar si está obligado a facturar electrónicamente, respetar '
            + 'los topes de expedición de documentos equivalentes (5 UVT) y gestionar la transición hacia el documento '
            + 'equivalente electrónico mediante los canales que la DIAN disponga.',
        },
        {
          p: 'Exoneración de responsabilidad tributaria: XASKA queda expresamente exonerada de toda responsabilidad '
            + 'civil, comercial, tributaria, sancionatoria o solidaria frente al cliente o frente a terceros (incluida la '
            + 'DIAN o la UGPP) por errores, omisiones, extemporaneidad en la declaración de impuestos, multas, o cierres '
            + 'de establecimiento derivados del uso inadecuado del sistema POS por parte del cliente, siendo este el único '
            + 'responsable de su cumplimiento fiscal.',
        },
      ],
    },
    {
      id: 'disponibilidad',
      title: '7. Disponibilidad, soporte y respaldos',
      blocks: [{
        list: [
          'Hacemos lo razonable para que el servicio esté disponible, pero no garantizamos que funcione sin '
            + 'interrupciones: puede haber pausas por mantenimiento (las avisamos cuando se puede) o fallas de '
            + 'proveedores o de internet.',
          'Hacemos copias de seguridad cifradas todos los días. Aun así, te recomendamos exportar tus reportes con '
            + 'regularidad.',
          `Soporte por ${O.email}, en días hábiles. [DEFINIR HORARIO Y TIEMPO DE RESPUESTA.]`,
        ],
      }],
    },
    {
      id: 'responsabilidad',
      title: '8. Responsabilidad',
      blocks: [
        {
          p: 'El servicio se entrega tal como está y lo mejoramos de forma continua. No respondemos por pérdidas '
            + 'indirectas, como ventas o ganancias dejadas de recibir, ni por fallas causadas por internet, equipos del '
            + 'cliente o terceros. En todo caso, nuestra responsabilidad total no supera lo que pagaste por el servicio '
            + 'en los últimos 3 meses. Esto no limita los derechos que la ley no permite renunciar.',
        },
        {
          p: 'La provisión del servicio XASKA POS se realiza bajo la modalidad de obligación de medio y no de resultado. '
            + 'XASKA no asume responsabilidad alguna por lucro cesante, daño emergente, pérdida de información comercial '
            + 'o afectación a la imagen del negocio derivados de intermitencias del servidor, mantenimientos '
            + 'programados, fallas eléctricas, hackeos de terceros o interrupciones en la conectividad a internet. El '
            + 'usuario se obliga a mantener indemne a XASKA ante cualquier reclamación judicial o extrajudicial derivada '
            + 'del uso del sistema.',
        },
      ],
    },
    {
      id: 'cierre',
      title: '9. Cancelación y cierre',
      blocks: [{
        list: [
          'Puedes cerrar tu negocio en Ajustes cuando quieras. Durante 30 días puedes pedir recuperarlo o exportar los '
            + 'datos; después se borran como dice la Política.',
          'Podemos suspender una cuenta por falta de pago o por incumplir estos términos, avisando por correo.',
        ],
      }],
    },
    {
      id: 'ley',
      title: '10. Cambios, ley y conflictos',
      blocks: [{
        list: [
          'Si cambiamos estos términos de fondo, te avisaremos antes y te pediremos aceptarlos de nuevo.',
          'Se rigen por la ley colombiana. Si eres consumidor según la Ley 1480 de 2011, conservas los derechos que esa '
            + 'ley te da.',
          `Cualquier diferencia se intentará resolver primero escribiendo a ${O.email}; si no hay acuerdo, ante los `
            + `jueces de ${O.city}.`,
        ],
      }],
    },
    {
      id: 'propiedad-intelectual',
      title: '11. Propiedad intelectual y licenciamiento SaaS',
      blocks: [{
        p: 'El uso de XASKA POS no transfiere ningún derecho de propiedad. XASKA es el titular exclusivo de los derechos '
          + 'patrimoniales sobre el código fuente, la estructura de la base de datos, el diseño de la interfaz y la marca '
          + 'comercial (Ley 23 de 1982 y Decisión Andina 351). El pago del plan otorga al cliente una licencia de uso '
          + 'temporal, no exclusiva, revocable e intransferible (Software as a Service). Queda estrictamente prohibido '
          + 'intentar acceder al código fuente, realizar ingeniería inversa, descompilar, modificar o crear obras '
          + 'derivadas del sistema. El incumplimiento de esta cláusula causará la terminación inmediata del servicio sin '
          + 'derecho a reembolso y la iniciación de acciones legales.',
      }],
    },
  ],
};

export function legalDocument(kind: LegalKind): LegalDocument {
  return kind === 'terminos' ? TERMS : PRIVACY_POLICY;
}
