/** Textos de Aska, la IA de XASKA (decisiones 296 y 298). */
import { XIconName } from '../../shared/icons/xicons';

/** Preguntas de ejemplo, cada una con el permiso que necesita su respuesta y su ícono. */
export const SUGGESTIONS: readonly { text: string; permission: string; icon: XIconName }[] = [
  { text: '¿Cuánto vendí hoy y cómo voy frente a ayer?', permission: 'reports:read', icon: 'reports' },
  // Decisión 356: margen de todo el catálogo y a qué hora se vende más.
  { text: '¿Qué productos me dejan poca ganancia?', permission: 'reports:read', icon: 'products' },
  { text: '¿A qué hora y qué día vendo más?', permission: 'reports:read', icon: 'reports' },
  { text: '¿Qué productos están por debajo del mínimo?', permission: 'inventory:read', icon: 'stock' },
  { text: '¿Qué se me vence este mes?', permission: 'inventory:read', icon: 'expiry' },
  { text: '¿Quién me debe más en fiados?', permission: 'credit:read', icon: 'credit' },
  { text: '¿Cuánto les debo a los proveedores y qué vence esta semana?', permission: 'purchases:read', icon: 'payables' },
  { text: '¿Cuánto he vendido hoy?', permission: 'sales:read', icon: 'sell' },
  // Decisión 357: cómo se usa la app, para cualquiera que venda.
  { text: '¿Cómo anulo una venta?', permission: 'sales:read', icon: 'sell' },
];

/** Hasta 4 ejemplos que la persona sí puede preguntar. */
export function suggestionsFor(has: (permission: string) => boolean): { text: string; icon: XIconName }[] {
  return SUGGESTIONS.filter((s) => has(s.permission)).map(({ text, icon }) => ({ text, icon })).slice(0, 4);
}

/** Trozo de texto, resaltado si iba entre ** **; con {@code href}, enlace al manual de XASKA. */
export interface Inline {
  text: string;
  strong: boolean;
  href?: string;
}

/** Bloque de la respuesta: párrafo, lista (líneas con "- ") o pasos numerados ("1. "). */
export type AnswerBlock = { kind: 'p'; parts: Inline[] } | { kind: 'list'; items: Inline[][] }
  | { kind: 'steps'; items: Inline[][] };

/** Solo se vuelven enlaces las secciones del manual (decisión 357); cualquier otra dirección queda como texto. */
const MANUAL_LINK = /(https:\/\/app\.xaska\.co)?\/manual(#[a-z0-9-]+)?/g;

/** Cifra clave de la respuesta ("CIFRA: Ticket promedio | $20.389"). */
export interface Figure {
  label: string;
  value: string;
}

export interface ParsedAnswer {
  blocks: AnswerBlock[];
  figures: Figure[];
  /** Preguntas para seguir ("SIGUE: ¿y la semana pasada?"). */
  followUps: string[];
}

/** Separa el texto en partes normales y resaltadas (sin interpretar HTML ni otro markdown). */
export function inline(text: string): Inline[] {
  const parts: Inline[] = [];
  text.split('**').forEach((chunk, i) => {
    const strong = i % 2 === 1;
    let at = 0;
    for (const match of chunk.matchAll(MANUAL_LINK)) {
      const start = match.index ?? 0;
      if (start > at) {
        parts.push({ text: chunk.slice(at, start), strong });
      }
      parts.push({ text: 'Ver en el manual', strong, href: '/manual' + (match[2] ?? '') });
      at = start + match[0].length;
    }
    if (at < chunk.length) {
      parts.push({ text: chunk.slice(at), strong });
    }
  });
  return parts;
}

/** Arma párrafos, listas, cifras clave y preguntas para seguir a partir del texto de Aska. */
export function parseAnswer(answer: string): ParsedAnswer {
  const blocks: AnswerBlock[] = [];
  const figures: Figure[] = [];
  const followUps: string[] = [];
  for (const raw of answer.split('\n')) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const figure = /^CIFRA:\s*(.+?)\s*\|\s*(.+)$/i.exec(line);
    if (figure) {
      if (figures.length < 4) {
        figures.push({ label: figure[1].replace(/\*\*/g, ''), value: figure[2].replace(/\*\*/g, '') });
      }
      continue;
    }
    const follow = /^SIGUE:\s*(.+)$/i.exec(line);
    if (follow) {
      if (followUps.length < 2) {
        followUps.push(follow[1].replace(/\*\*/g, ''));
      }
      continue;
    }
    const item = /^[-•*]\s+(.*)$/.exec(line);
    const step = /^\d{1,2}[.)]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (step) {
      if (last?.kind === 'steps') {
        last.items.push(inline(step[1]));
      } else {
        blocks.push({ kind: 'steps', items: [inline(step[1])] });
      }
    } else if (item) {
      if (last?.kind === 'list') {
        last.items.push(inline(item[1]));
      } else {
        blocks.push({ kind: 'list', items: [inline(item[1])] });
      }
    } else {
      blocks.push({ kind: 'p', parts: inline(line.replace(/^#+\s*/, '')) });
    }
  }
  return { blocks, figures, followUps };
}

/** "3 de 300 preguntas este mes". */
export function usageText(used: number, limit: number): string {
  return used >= limit
    ? `Llegaste a las ${limit} preguntas de este mes.`
    : `${used} de ${limit} preguntas este mes.`;
}

/** Primer nombre para el saludo ("Daniel Mejía" → "Daniel"). */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}
