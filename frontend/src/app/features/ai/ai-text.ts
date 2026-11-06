/** Textos de "Pregúntale a tu negocio" (decisión 296). */

/** Preguntas de ejemplo, cada una con el permiso que necesita su respuesta. */
export const SUGGESTIONS: readonly { text: string; permission: string }[] = [
  { text: '¿Cuánto vendí hoy y cómo voy frente a ayer?', permission: 'reports:read' },
  { text: '¿Cuáles fueron los 5 productos más vendidos esta semana?', permission: 'reports:read' },
  { text: '¿Qué productos están por debajo del mínimo?', permission: 'inventory:read' },
  { text: '¿Qué se me vence este mes?', permission: 'inventory:read' },
  { text: '¿Quién me debe más en fiados?', permission: 'credit:read' },
  { text: '¿Cuánto les debo a los proveedores y qué vence esta semana?', permission: 'purchases:read' },
  { text: '¿Cuánto he vendido hoy?', permission: 'sales:read' },
];

/** Hasta 4 ejemplos que la persona sí puede preguntar. */
export function suggestionsFor(has: (permission: string) => boolean): string[] {
  return SUGGESTIONS.filter((s) => has(s.permission)).map((s) => s.text).slice(0, 4);
}

/** Bloque de la respuesta: párrafo o lista (líneas que empiezan con "- "). */
export type AnswerBlock = { kind: 'p'; text: string } | { kind: 'list'; items: string[] };

/** Arma párrafos y listas a partir del texto de la IA (sin interpretar HTML ni markdown). */
export function answerBlocks(answer: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  for (const raw of answer.replace(/\*\*/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const item = /^[-•*]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (item) {
      if (last?.kind === 'list') {
        last.items.push(item[1]);
      } else {
        blocks.push({ kind: 'list', items: [item[1]] });
      }
    } else {
      blocks.push({ kind: 'p', text: line.replace(/^#+\s*/, '') });
    }
  }
  return blocks;
}

/** "3 de 300 preguntas este mes". */
export function usageText(used: number, limit: number): string {
  return used >= limit
    ? `Llegaste a las ${limit} preguntas de este mes.`
    : `${used} de ${limit} preguntas este mes.`;
}
