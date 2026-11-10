/**
 * Código de invitación (decisión 312): llega en el enlace (…/registro?ref=ESQUIN-7KQ) y se recuerda en el equipo
 * mientras la persona crea su cuenta, confirma el correo y crea su negocio.
 */
const KEY = 'xaska.referral';
const PATTERN = /^[A-Z0-9]{3,6}-[A-Z0-9]{3}$/;

export function normalizeReferral(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export function rememberReferral(code: string | null | undefined): void {
  const c = normalizeReferral(code);
  if (!PATTERN.test(c)) {
    return;
  }
  try {
    localStorage.setItem(KEY, c);
  } catch {
    // Sin almacenamiento: lo escriben a mano.
  }
}

export function readReferral(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearReferral(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nada que borrar.
  }
}

/** El mensaje para WhatsApp con el enlace. */
export function referralMessage(businessName: string, link: string): string {
  return `Hola, en ${businessName} usamos XASKA POS para vender, llevar el inventario y la caja, y Aska, su IA, nos `
    + `lee las facturas con una foto. Si te registras con mi enlace tienes 14 días gratis con la IA incluida: ${link}`;
}
