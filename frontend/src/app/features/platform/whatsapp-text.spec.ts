import { followUpPreview, waContact, waKind, waLead, waName, waPhone, waRatingLine, waStars, waStateWarning, waWindowNote } from './whatsapp-text';

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

  it('muestra la plantilla de seguimiento como la verá el cliente (decisión 371)', () => {
    const t = 'Hola {{1}}, ¿cómo te va con XASKA POS en {{2}}?';
    expect(followUpPreview(t, 'Carlos Rojas', 'La Tribuna Bar')).toBe('Hola Carlos, ¿cómo te va con XASKA POS en La Tribuna Bar?');
    expect(followUpPreview(t, null, null)).toBe('Hola qué tal, ¿cómo te va con XASKA POS en tu negocio?');
  });

  it('resume el negocio y avisa lo que falta configurar', () => {
    expect(waLead({ leadBusiness: 'Tienda Marta', leadCity: 'Ibagué', leadNeed: null })).toBe('Tienda Marta · Ibagué');
    expect(waStateWarning({ receives: true, sends: true, ai: true })).toBeNull();
    expect(waStateWarning({ receives: false, sends: true, ai: true })).toContain('WHATSAPP_');
    expect(waStateWarning({ receives: true, sends: true, ai: false })).toContain('ANTHROPIC_API_KEY');
  });

  it('muestra si es cliente y cómo calificó (decisión 375)', () => {
    expect(waKind('CLIENT')).toBe('Cliente');
    expect(waKind('NEW')).toBe('Nuevo');
    expect(waKind(null)).toBeNull();
    expect(waStars(4)).toBe('★★★★☆ 4');
    expect(waRatingLine({ id: 'r', attendedBy: 'HUMAN', closedBy: 'IDLE', requestedAt: '', score: 2, ratedAt: '',
      comment: 'Tardaron' })).toBe('★★☆☆☆ 2 · atención de XASKA, cerrada por 30 min sin respuesta · “Tardaron”');
    expect(waRatingLine({ id: 'r', attendedBy: 'BOT', closedBy: 'BOT', requestedAt: '', score: null, ratedAt: null,
      comment: null })).toBe('Sin calificar todavía (atención de Aska, se despidió)');
  });

  it('explica por qué no se le puede escribir: no ha respondido o pasaron 24 horas (decisión 376)', () => {
    expect(waWindowNote({ lastInboundAt: null })).toContain('Todavía no ha respondido');
    expect(waWindowNote({ lastInboundAt: '2026-11-20T10:00:00Z' })).toContain('más de 24 horas');
  });
});
