import { PartyDraft, emptyDraft } from '../parties/party-form';

/**
 * Borrador de "Nuevo cliente" desde la venta: aprovecha lo que el cajero ya escribió en la búsqueda. Si son números,
 * es el documento; si son palabras, la primera va a nombres y el resto a apellidos (el cajero corrige si hace falta).
 */
export function quickCustomerDraft(searchText: string): PartyDraft {
  const draft = emptyDraft();
  const text = searchText.trim().replace(/\s+/g, ' ');
  if (!text) {
    return draft;
  }
  const digits = text.replace(/[\s.-]/g, '');
  if (/^\d+$/.test(digits)) {
    draft.documentNumber = digits;
    return draft;
  }
  const [first, ...rest] = text.split(' ');
  draft.firstNames = first;
  draft.lastNames = rest.join(' ');
  return draft;
}
