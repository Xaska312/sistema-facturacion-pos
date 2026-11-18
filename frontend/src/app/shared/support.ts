/**
 * Contacto de XASKA dentro de la app (decisión 364): el WhatsApp lo atiende Aska a toda hora y pasa con una persona
 * cuando hace falta. Es el mismo de xaska.co.
 */
export const XASKA_SUPPORT = {
  whatsapp: '573245560729',
  phone: '+57 324 556 0729',
  email: 'soporte@xaska.co',
  hours: 'Lunes a sábado, 8:00 a. m. a 6:00 p. m.',
} as const;

/** Enlace a WhatsApp de XASKA con un mensaje inicial. */
export function supportWhatsAppLink(text = 'Hola, necesito ayuda con XASKA POS.'): string {
  return `https://wa.me/${XASKA_SUPPORT.whatsapp}?text=${encodeURIComponent(text)}`;
}
