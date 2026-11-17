import { WaConversation, WaStatus } from '../../core/api/whatsapp.api';

/** Textos de la pantalla del agente de WhatsApp (decisión 362). */
export const WA_STATUS_LABEL: Record<WaStatus, string> = {
  BOT: 'Con el asistente',
  HUMAN: 'Con una persona',
  CLOSED: 'Cerrada',
};

export const WA_AUTHOR_LABEL: Record<'CUSTOMER' | 'BOT' | 'HUMAN', string> = {
  CUSTOMER: 'Cliente',
  BOT: 'Asistente',
  HUMAN: 'XASKA',
};

/** Nombre para mostrar: lo que contó la persona, su nombre de WhatsApp o el número. */
export function waName(c: Pick<WaConversation, 'leadName' | 'profileName' | 'phone'>): string {
  return c.leadName || c.profileName || waPhone(c.phone);
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

/** Aviso cuando falta configurar algo en el servidor; null si todo está listo. */
export function waStateWarning(s: { receives: boolean; sends: boolean; ai: boolean }): string | null {
  if (!s.receives || !s.sends) {
    return 'WhatsApp aún no está conectado en el servidor: faltan las variables WHATSAPP_* (token, número y clave de la app de Meta).';
  }
  if (!s.ai) {
    return 'Falta la clave de la IA (ANTHROPIC_API_KEY): el asistente no puede responder y pasará cada conversación a una persona.';
  }
  return null;
}
