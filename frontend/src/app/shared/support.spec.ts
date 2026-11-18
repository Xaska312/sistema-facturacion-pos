import { XASKA_SUPPORT, supportWhatsAppLink } from './support';

describe('Contacto de XASKA (decisión 364)', () => {
  it('arma el enlace de WhatsApp con el mensaje', () => {
    expect(supportWhatsAppLink('Hola')).toBe('https://wa.me/573245560729?text=Hola');
    expect(supportWhatsAppLink()).toContain('XASKA%20POS');
    expect(XASKA_SUPPORT.phone).toBe('+57 324 556 0729');
  });
});
