import { firstName, inline, parseAnswer, suggestionsFor, usageText } from './ai-text';

describe('Aska (decisiones 296 y 298)', () => {
  it('sugiere solo lo que la persona puede ver', () => {
    expect(suggestionsFor((p) => p === 'sales:read').map((s) => s.text)).toEqual(['¿Cuánto he vendido hoy?']);
    expect(suggestionsFor(() => true).length).toBe(4);
  });

  it('arma párrafos, listas, cifras clave y preguntas para seguir', () => {
    const parsed = parseAnswer('Hoy vendiste **$1.200.000**.\n\n- Café: $300.000\n- Pan: $200.000\n'
      + 'CIFRA: Ticket promedio | $20.389\nCIFRA: Ventas | 63\nSIGUE: ¿Y la semana pasada?\nSIGUE: ¿Qué se vendió menos?\n'
      + 'SIGUE: Una tercera');
    expect(parsed.blocks[0]).toEqual({ kind: 'p', parts: [{ text: 'Hoy vendiste ', strong: false },
      { text: '$1.200.000', strong: true }, { text: '.', strong: false }] });
    expect(parsed.blocks[1]).toEqual({ kind: 'list', items: [[{ text: 'Café: $300.000', strong: false }],
      [{ text: 'Pan: $200.000', strong: false }]] });
    expect(parsed.figures).toEqual([{ label: 'Ticket promedio', value: '$20.389' }, { label: 'Ventas', value: '63' }]);
    expect(parsed.followUps).toEqual(['¿Y la semana pasada?', '¿Qué se vendió menos?']);
  });

  it('no interpreta HTML: queda como texto', () => {
    expect(inline('<b>x</b>')).toEqual([{ text: '<b>x</b>', strong: false }]);
  });

  it('cuenta las preguntas y saluda por el nombre', () => {
    expect(usageText(3, 300)).toBe('3 de 300 preguntas este mes.');
    expect(usageText(300, 300)).toContain('Llegaste');
    expect(firstName('Daniel Mejía')).toBe('Daniel');
    expect(firstName(null)).toBe('');
  });
});
