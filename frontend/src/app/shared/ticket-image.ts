/**
 * Tiquete como imagen (decisión 315): el mismo recibo del mensaje de WhatsApp dibujado en una imagen PNG blanca, con
 * letra fija, para que se vea igual en cualquier teléfono (en texto, WhatsApp usa la letra del teléfono de quien lo
 * envía) y no se pueda editar. En el celular se comparte directo (WhatsApp, correo…); en el computador se descarga.
 */
const WIDTH = 720;
const PAD = 40;
const FONT = 'Arial, Helvetica, sans-serif';

export interface TicketImage {
  title: string;
  lines: string[];
}

/** Parte una línea en varias que quepan en el ancho. */
export function wrap(text: string, fits: (s: string) => boolean): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (!line || fits(next)) {
      line = next;
    } else {
      out.push(line);
      line = w;
    }
  }
  if (line) {
    out.push(line);
  }
  return out.length > 0 ? out : [''];
}

/** Dibuja el tiquete; null si el navegador no puede (muy raro). */
export async function ticketPng(ticket: TicketImage): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  const body = `500 28px ${FONT}`;
  const bold = `800 30px ${FONT}`;
  ctx.font = body;
  const max = WIDTH - PAD * 2;
  type Row = { text: string; font: string; color: string; gap: number };
  const rows: Row[] = [];
  for (const raw of ticket.lines) {
    const strong = /^(Total|\*\*\*)/.test(raw);
    ctx.font = strong ? bold : body;
    const color = raw.startsWith('***') ? '#b91c1c' : '#111827';
    for (const text of wrap(raw, (s) => ctx.measureText(s).width <= max)) {
      rows.push({ text, font: strong ? bold : body, color, gap: 40 });
    }
  }
  const titleFont = `800 38px ${FONT}`;
  ctx.font = titleFont;
  const titleRows = wrap(ticket.title, (s) => ctx.measureText(s).width <= max);
  const height = PAD + titleRows.length * 48 + 24 + rows.length * 40 + PAD;
  canvas.width = WIDTH;
  canvas.height = height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, height);
  let y = PAD + 36;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#111827';
  ctx.font = titleFont;
  for (const t of titleRows) {
    ctx.fillText(t, WIDTH / 2, y);
    y += 48;
  }
  ctx.strokeStyle = '#d1d5db';
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(PAD, y - 22);
  ctx.lineTo(WIDTH - PAD, y - 22);
  ctx.stroke();
  y += 16;
  ctx.textAlign = 'left';
  for (const r of rows) {
    ctx.font = r.font;
    ctx.fillStyle = r.color;
    ctx.fillText(r.text, PAD, y);
    y += r.gap;
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/**
 * Comparte la imagen (celular: el menú de compartir con WhatsApp; computador con Chrome o Edge también) o, si no se
 * puede, la descarga. Devuelve 'shared', 'downloaded' o 'cancelled'.
 */
export async function shareTicketPng(blob: Blob, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], fileName, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
