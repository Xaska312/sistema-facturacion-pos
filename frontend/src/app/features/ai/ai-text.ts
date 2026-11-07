/** Textos de Aska, la IA de XASKA (decisiones 296 y 298). */
import { XIconName } from '../../shared/icons/xicons';

/** Preguntas de ejemplo, cada una con el permiso que necesita su respuesta y su ícono. */
export const SUGGESTIONS: readonly { text: string; permission: string; icon: XIconName }[] = [
  { text: '¿Cuánto vendí hoy y cómo voy frente a ayer?', permission: 'reports:read', icon: 'reports' },
  { text: '¿Cuáles fueron los 5 productos más vendidos esta semana?', permission: 'reports:read', icon: 'products' },
  { text: '¿Qué productos están por debajo del mínimo?', permission: 'inventory:read', icon: 'stock' },
  { text: '¿Qué se me vence este mes?', permission: 'inventory:read', icon: 'expiry' },
  { text: '¿Quién me debe más en fiados?', permission: 'credit:read', icon: 'credit' },
  { text: '¿Cuánto les debo a los proveedores y qué vence esta semana?', permission: 'purchases:read', icon: 'payables' },
  { text: '¿Cuánto he vendido hoy?', permission: 'sales:read', icon: 'sell' },
];

/** Hasta 4 ejemplos que la persona sí puede preguntar. */
export function suggestionsFor(has: (permission: string) => boolean): { text: string; icon: XIconName }[] {
  return SUGGESTIONS.filter((s) => has(s.permission)).map(({ text, icon }) => ({ text, icon })).slice(0, 4);
}

/** Trozo de texto, resaltado si iba entre ** **. */
export interface Inline {
  text: string;
  strong: boolean;
}

/** Bloque de la respuesta: párrafo o lista (líneas que empiezan con "- "). */
export type AnswerBlock = { kind: 'p'; parts: Inline[] } | { kind: 'list'; items: Inline[][] };

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
    if (chunk) {
      parts.push({ text: chunk, strong: i % 2 === 1 });
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
    const last = blocks[blocks.length - 1];
    if (item) {
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
