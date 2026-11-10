import { ticketPng, wrap } from './ticket-image';

describe('Tiquete como imagen (decisión 315)', () => {
  it('parte las líneas largas sin cortar palabras', () => {
    const fits = (s: string) => s.length <= 12;
    expect(wrap('Lápida tradicional grande de mármol', fits)).toEqual(['Lápida', 'tradicional', 'grande de', 'mármol']);
    expect(wrap('', fits)).toEqual(['']);
  });

  it('dibuja un PNG', async () => {
    const blob = await ticketPng({ title: 'Mármoles Rosas', lines: ['Tiquete POS-1', 'Total: $ 2.250.000'] });
    expect(blob?.type).toBe('image/png');
    expect(blob!.size).toBeGreaterThan(500);
  });
});
