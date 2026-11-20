import { waContact, waLead, waName, waPhone, waStateWarning } from './whatsapp-text';

describe('Agente de WhatsApp (decisión 362)', () => {
  it('muestra el nombre que se conoce y el número legible', () => {
    expect(waPhone('573001112233')).toBe('+57 300 111 2233');
    expect(waPhone('15551234567')).toBe('+15551234567');
    expect(waName({ leadName: 'Marta', profileName: 'M', phone: '573001112233' })).toBe('Marta');
    expect(waName({ leadName: null, profileName: null, phone: '573001112233' })).toBe('+57 300 111 2233');
  });

  it('las conversaciones del chat de xaska.co no tienen número (decisión 364)', () => {
    expect(waName({ leadName: null, profileName: null, phone: null })).toBe('Visitante de xaska.co');
    expect(waName({ leadName: null, profileName: null, phone: null, leadPhone: '573001112233' })).toBe('+57 300 111 2233');
    expect(waContact({ channel: 'WEB', phone: null, leadPhone: null })).toBe('Chat de xaska.co');
    expect(waContact({ channel: 'WEB', phone: null, leadPhone: '573001112233' })).toBe('Chat de xaska.co · WhatsApp +57 300 111 2233');
    expect(waContact({ channel: 'WHATSAPP', phone: '573001112233', leadPhone: null })).toBe('+57 300 111 2233');
    // Decisión 368: por WhatsApp con nombre de usuario puede no llegar el número.
    expect(waContact({ channel: 'WHATSAPP', phone: null, leadPhone: null })).toContain('sin número');
    expect(waName({ leadName: null, profileName: null, phone: null, channel: 'WHATSAPP' })).toBe('Usuario de WhatsApp');
  });

  it('resume el negocio y avisa lo que falta configurar', () => {
    expect(waLead({ leadBusiness: 'Tienda Marta', leadCity: 'Ibagué', leadNeed: null })).toBe('Tienda Marta · Ibagué');
    expect(waStateWarning({ receives: true, sends: true, ai: true })).toBeNull();
    expect(waStateWarning({ receives: false, sends: true, ai: true })).toContain('WHATSAPP_');
    expect(waStateWarning({ receives: true, sends: true, ai: false })).toContain('ANTHROPIC_API_KEY');
  });
});
