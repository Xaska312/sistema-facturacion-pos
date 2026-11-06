import { answerBlocks, suggestionsFor, usageText } from './ai-text';

describe('Pregúntale a tu negocio (decisión 296)', () => {
  it('sugiere solo lo que la persona puede ver', () => {
    expect(suggestionsFor((p) => p === 'sales:read')).toEqual(['¿Cuánto he vendido hoy?']);
    expect(suggestionsFor(() => true).length).toBe(4);
  });

  it('arma párrafos y listas sin markdown ni HTML', () => {
    expect(answerBlocks('Hoy vendiste **$1.200.000**.\n\n- Café: $300.000\n- Pan: $200.000\nEso es todo.')).toEqual([
      { kind: 'p', text: 'Hoy vendiste $1.200.000.' },
      { kind: 'list', items: ['Café: $300.000', 'Pan: $200.000'] },
      { kind: 'p', text: 'Eso es todo.' },
    ]);
    expect(answerBlocks('## Resumen\n<b>x</b>')).toEqual([
      { kind: 'p', text: 'Resumen' }, { kind: 'p', text: '<b>x</b>' },
    ]);
  });

  it('cuenta las preguntas del mes', () => {
    expect(usageText(3, 300)).toBe('3 de 300 preguntas este mes.');
    expect(usageText(300, 300)).toContain('Llegaste');
  });
});
