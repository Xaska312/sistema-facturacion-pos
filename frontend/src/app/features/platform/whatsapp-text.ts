import { WaConversation, WaRating, WaStatus } from '../../core/api/whatsapp.api';

/** Textos de la pantalla del agente de WhatsApp (decisión 362). */
export const WA_STATUS_LABEL: Record<WaStatus, string> = {
  BOT: 'Con Aska',
  HUMAN: 'Con una persona',
  CLOSED: 'Cerrada',
};

export const WA_AUTHOR_LABEL: Record<'CUSTOMER' | 'BOT' | 'HUMAN', string> = {
  CUSTOMER: 'Cliente',
  BOT: 'Aska',
  HUMAN: 'XASKA',
};

/** Nombre para mostrar: lo que contó la persona, su nombre de WhatsApp, el número o "Visitante de xaska.co". */
export function waName(c: Pick<WaConversation, 'leadName' | 'profileName' | 'phone'>
  & { leadPhone?: string | null; channel?: WaConversation['channel'] }): string {
  const fallback = c.channel === 'WHATSAPP' ? 'Usuario de WhatsApp' : 'Visitante de xaska.co';
  return c.leadName || c.profileName || (c.phone ? waPhone(c.phone) : c.leadPhone ? waPhone(c.leadPhone) : fallback);
}

/** Cómo se contacta: el número de WhatsApp o, en la web, el chat (con el WhatsApp que dejó, si lo dejó). */
export function waContact(c: Pick<WaConversation, 'channel' | 'phone' | 'leadPhone'>): string {
  if (c.channel === 'WEB') {
    return c.leadPhone ? `Chat de xaska.co · WhatsApp ${waPhone(c.leadPhone)}` : 'Chat de xaska.co';
  }
  // Decisión 368: quien usa nombre de usuario puede escribir sin mostrar su número; igual se le responde.
  return c.phone ? waPhone(c.phone) : 'WhatsApp, sin número (usa nombre de usuario)';
}

/** 573001112233 → +57 300 111 2233 (números de Colombia); los demás con "+" delante. */
export function waPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('57')) {
    return `+57 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return `+${digits}`;
}

/** Lo que se sabe del negocio de la persona, en una línea. */
export function waLead(c: Pick<WaConversation, 'leadBusiness' | 'leadCity' | 'leadNeed'>): string {
  return [c.leadBusiness, c.leadCity, c.leadNeed].filter((x): x is string => !!x).join(' · ');
}

/** La plantilla de seguimiento con el primer nombre y el negocio, como la verá el cliente (decisión 371). */
export function followUpPreview(template: string, ownerName: string | null, business: string | null): string {
  const first = (ownerName ?? '').trim().split(/\s+/)[0] || 'qué tal';
  return template.replace('{{1}}', first).replace('{{2}}', (business ?? '').trim() || 'tu negocio');
}

/** Aviso cuando falta configurar algo en el servidor; null si todo está listo. */
export function waStateWarning(s: { receives: boolean; sends: boolean; ai: boolean }): string | null {
  if (!s.receives || !s.sends) {
    return 'WhatsApp aún no está conectado en el servidor: faltan las variables WHATSAPP_* (token, número y clave de la app de Meta).';
  }
  if (!s.ai) {
    return 'Falta la clave de la IA (ANTHROPIC_API_KEY): Aska no puede responder y pasará cada conversación a una persona.';
  }
  return null;
}

/** "Cliente" o "Nuevo" (decisión 375); null si Aska aún no lo sabe. */
export function waKind(kind: WaConversation['customerKind']): string | null {
  return kind === 'CLIENT' ? 'Cliente' : kind === 'NEW' ? 'Nuevo' : null;
}

/** 4 → "★★★★☆ 4". */
export function waStars(score: number): string {
  const n = Math.max(0, Math.min(5, Math.round(score)));
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)} ${n}`;
}

/** Una calificación en una línea: estrellas, a quién califica, cómo se cerró y el comentario. */
export function waRatingLine(r: WaRating): string {
  const who = r.attendedBy === 'HUMAN' ? 'atención de XASKA' : 'atención de Aska';
  const how = r.closedBy === 'IDLE' ? 'cerrada por 30 min sin respuesta'
    : r.closedBy === 'BOT' ? 'se despidió' : 'la cerraste tú';
  const head = r.score === null ? `Sin calificar todavía (${who}, ${how})` : `${waStars(r.score)} · ${who}, ${how}`;
  return r.comment ? `${head} · “${r.comment}”` : head;
}
