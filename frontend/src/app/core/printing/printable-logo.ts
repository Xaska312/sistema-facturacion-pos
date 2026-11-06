import { MonoImage, monoFromGray, paperDots } from './escpos';

/** Alto máximo del logo: 18 mm (8 puntos por mm), como en el tiquete de la pantalla. */
export const LOGO_MAX_DOTS_HIGH = 144;

/** Tamaño del logo en puntos: hasta la mitad del ancho del papel y 18 mm de alto, sin deformarlo. */
export function logoSize(naturalWidth: number, naturalHeight: number, width: 58 | 80): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(paperDots(width) / 2 / naturalWidth, LOGO_MAX_DOTS_HIGH / naturalHeight);
  return { width: Math.max(1, Math.round(naturalWidth * scale)), height: Math.max(1, Math.round(naturalHeight * scale)) };
}

const cache = new Map<string, Promise<MonoImage | null>>();

/**
 * El logo del negocio (data URL o dirección de la misma app) listo para la térmica (decisión 292): se dibuja sobre
 * blanco (lo transparente queda blanco), se pasa a gris y a puntos, centrado. Se calcula una vez por logo y ancho.
 * Si no se puede (sin logo, imagen dañada), null: el tiquete sale igual, sin logo.
 */
export function printableLogo(src: string | null, width: 58 | 80): Promise<MonoImage | null> {
  if (!src) {
    return Promise.resolve(null);
  }
  const key = `${width}|${src}`;
  let found = cache.get(key);
  if (!found) {
    found = render(src, width).catch(() => null);
    if (cache.size > 8) {
      cache.clear();
    }
    cache.set(key, found);
  }
  return found;
}

async function render(src: string, width: 58 | 80): Promise<MonoImage | null> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const size = logoSize(img.naturalWidth, img.naturalHeight, width);
  if (size.width === 0) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = '#fff'; // color-literal-ok: el papel térmico es blanco (lo transparente del logo no se imprime)
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size.width, size.height);
  const rgba = ctx.getImageData(0, 0, size.width, size.height).data;
  const gray = new Uint8ClampedArray(size.width * size.height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return monoFromGray(gray, size.width, size.height, paperDots(width));
}
