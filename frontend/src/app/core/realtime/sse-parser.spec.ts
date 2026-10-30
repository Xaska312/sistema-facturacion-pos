import { SseParser } from './sse-parser';

describe('lector de avisos en tiempo real (Fase 12b-4)', () => {
  it('arma los mensajes aunque lleguen partidos y salta los comentarios', () => {
    const parser = new SseParser();
    expect(parser.push(': ping\n\nevent:TICKET_SENT\nda')).toEqual([]);
    expect(parser.push('ta:{"number":12}\n\nevent: READY\r\ndata: {}\r\n\r\n')).toEqual([
      { event: 'TICKET_SENT', data: '{"number":12}' },
      { event: 'READY', data: '{}' },
    ]);
    expect(parser.push('data:a\ndata:b\n\n')).toEqual([{ event: 'message', data: 'a\nb' }]);
  });
});
