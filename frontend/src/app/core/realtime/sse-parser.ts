/**
 * Lector de Server-Sent Events (Fase 12b-4): recibe el texto en trozos (como llega por la red) y devuelve los mensajes
 * completos. Un mensaje termina con una línea vacía; los comentarios (": ping") se ignoran.
 */
export interface SseMessage {
  event: string;
  data: string;
}

export class SseParser {
  private buffer = '';

  push(chunk: string): SseMessage[] {
    this.buffer += chunk.replace(/\r\n?/g, '\n');
    const messages: SseMessage[] = [];
    let end = this.buffer.indexOf('\n\n');
    while (end >= 0) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith(':') || line === '') {
          continue;
        }
        const colon = line.indexOf(':');
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') {
          event = value;
        } else if (field === 'data') {
          data.push(value);
        }
      }
      if (data.length > 0) {
        messages.push({ event, data: data.join('\n') });
      }
      end = this.buffer.indexOf('\n\n');
    }
    return messages;
  }
}
