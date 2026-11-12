import { ReceiptRow } from './receipt/receipt-rows';

/**
 * Tiquete como imagen (decisiones 315 y 326): el mismo tiquete impreso (logo, columnas, total grande, línea
 * punteada) dibujado sobre un papel blanco angosto. En el celular se comparte directo (WhatsApp, correo…); en el
 * computador se descarga. Va en negro sobre blanco, como el papel, en cualquier tema.
 */
const PAPER = 600;
const PAD = 26;
const MARGIN = 40;
const SCALE = 1.6;
const SIZE = 24;
const LINE = Math.round(SIZE * 1.32);
const FONT = 'Arial, Helvetica, sans-serif';
const INK = '#000000';
const PAPER_BG = '#ffffff';
const DESK = '#e9ebef';
const SHADOW = 'rgba(15, 23, 42, 0.18)';

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

function font(row: { bold?: boolean; big?: boolean; small?: boolean }): string {
  const size = row.big ? SIZE * 1.15 : row.small ? SIZE * 0.85 : SIZE;
  return `${row.bold ? 800 : 600} ${Math.round(size)}px ${FONT}`;
}

type Painted =
  | { kind: 'hr' }
  | { kind: 'logo'; img: HTMLImageElement; w: number; h: number }
  | { kind: 'line'; font: string; height: number; left: string; right?: string; center?: boolean; indent?: number; gap: number };

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Dibuja el tiquete con el logo del negocio (data URL) si lo tiene; null si el navegador no puede (muy raro). */
export async function ticketPng(rows: ReceiptRow[], logo: string | null = null): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  const content = PAPER - PAD * 2;
  const painted: Painted[] = [];
  const img = logo ? await loadImage(logo) : null;
  if (img && img.width > 0 && img.height > 0) {
    const ratio = Math.min((content * 0.7) / img.width, 110 / img.height, 1.5);
    painted.push({ kind: 'logo', img, w: img.width * ratio, h: img.height * ratio });
  }
  for (const row of rows) {
    if (row.kind === 'hr') {
      painted.push({ kind: 'hr' });
      continue;
    }
    const f = font(row);
    ctx.font = f;
    const height = Math.round(LINE * (row.big ? 1.15 : 'small' in row && row.small ? 0.9 : 1));
    if (row.kind === 'pair') {
      const rightWidth = ctx.measureText(row.right).width;
      const parts = wrap(row.left, (s) => ctx.measureText(s).width <= content - rightWidth - 12);
      parts.forEach((left, i) =>
        painted.push({ kind: 'line', font: f, height, left, right: i === 0 ? row.right : undefined, gap: i === 0 && row.gap ? 6 : 0 }));
    } else {
      const indent = row.indent ? 18 : 0;
      wrap(row.text, (s) => ctx.measureText(s).width <= content - indent).forEach((text, i) =>
        painted.push({ kind: 'line', font: f, height, left: text, center: row.center, indent, gap: i === 0 && row.gap ? 6 : 0 }));
    }
  }
  const paperHeight = PAD * 2 + painted.reduce((h, p) =>
    h + (p.kind === 'hr' ? 14 : p.kind === 'logo' ? p.h + 8 : p.height + p.gap), 0);
  canvas.width = Math.round((PAPER + MARGIN * 2) * SCALE);
  canvas.height = Math.round((paperHeight + MARGIN * 2) * SCALE);
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = DESK;
  ctx.fillRect(0, 0, PAPER + MARGIN * 2, paperHeight + MARGIN * 2);
  // Papel con borde dentado arriba y abajo, como el que sale de la impresora.
  ctx.save();
  ctx.shadowColor = SHADOW;
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = PAPER_BG;
  ctx.beginPath();
  const x0 = MARGIN;
  const x1 = MARGIN + PAPER;
  const y0 = MARGIN;
  const y1 = MARGIN + paperHeight;
  const tooth = 12;
  ctx.moveTo(x0, y0);
  for (let x = x0; x < x1; x += tooth) {
    ctx.lineTo(Math.min(x + tooth / 2, x1), y0 + 5);
    ctx.lineTo(Math.min(x + tooth, x1), y0);
  }
  ctx.lineTo(x1, y1);
  for (let x = x1; x > x0; x -= tooth) {
    ctx.lineTo(Math.max(x - tooth / 2, x0), y1 - 5);
    ctx.lineTo(Math.max(x - tooth, x0), y1);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  let y = y0 + PAD;
  const left = x0 + PAD;
  const right = x1 - PAD;
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.textBaseline = 'alphabetic';
  for (const p of painted) {
    if (p.kind === 'logo') {
      ctx.save();
      ctx.filter = 'grayscale(1) contrast(1.6)';
      ctx.drawImage(p.img, x0 + (PAPER - p.w) / 2, y, p.w, p.h);
      ctx.restore();
      y += p.h + 8;
    } else if (p.kind === 'hr') {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(left, y + 7);
      ctx.lineTo(right, y + 7);
      ctx.stroke();
      ctx.restore();
      y += 14;
    } else {
      y += p.gap;
      ctx.font = p.font;
      const base = y + p.height * 0.78;
      if (p.center) {
        ctx.textAlign = 'center';
        ctx.fillText(p.left, x0 + PAPER / 2, base);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(p.left, left + (p.indent ?? 0), base);
      }
      if (p.right) {
        ctx.textAlign = 'right';
        ctx.fillText(p.right, right, base);
      }
      y += p.height;
    }
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
