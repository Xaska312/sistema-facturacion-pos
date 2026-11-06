/** Tipos de imagen que acepta el logo (sin SVG: puede llevar scripts). */
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Lo que admite el servidor (150 KB). */
export const MAX_LOGO_BYTES = 150 * 1024;

/** Bytes reales de una data URL en base64 (sin la cabecera ni el relleno "="). */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Medidas para que el lado mayor no pase de {@code max} (nunca se agranda). */
export function fitInside(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Reduce la imagen en el navegador (lado mayor de {@code max} px) y la devuelve como data URL: PNG si cabe (bordes
 * nítidos y fondo transparente) o WebP si el PNG pesa demasiado. Una foto de 5 MB queda en pocos KB.
 */
export async function shrinkImage(file: File, max = 320): Promise<string> {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('El logo debe ser una imagen PNG, JPG o WebP.');
  }
  const bitmap = await createImageBitmap(file);
  const size = fitInside(bitmap.width, bitmap.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Este navegador no pudo procesar la imagen.');
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  let dataUrl = canvas.toDataURL('image/png');
  if (dataUrlBytes(dataUrl) > MAX_LOGO_BYTES) {
    dataUrl = canvas.toDataURL('image/webp', 0.85);
  }
  if (dataUrlBytes(dataUrl) > MAX_LOGO_BYTES || !dataUrl.startsWith('data:image/')) {
    throw new Error('La imagen sigue siendo muy pesada. Prueba con una más sencilla.');
  }
  return dataUrl;
}

/** Fotos que se pueden reducir en el navegador antes de subirlas. */
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Reduce la foto de una factura a JPEG con el lado mayor de {@code max} px (decisión 295): una foto de 5 MB del
 * celular queda en unos 300 KB y sube rápido aun con mala señal. Si el navegador no puede (otro formato, sin canvas),
 * devuelve el archivo tal cual y el servidor decide.
 */
export async function shrinkPhoto(file: File, max = 1600, quality = 0.85): Promise<File> {
  if (!PHOTO_TYPES.includes(file.type)) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const bitmapWidth = bitmap.width;
    const bitmapHeight = bitmap.height;
    const size = fitInside(bitmapWidth, bitmapHeight, max);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.fillStyle = '#ffffff'; // color-literal-ok: fondo blanco del JPEG (no es interfaz)
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    const alreadySmall = size.width === bitmapWidth && size.height === bitmapHeight && file.type === 'image/jpeg';
    if (!blob || (alreadySmall && blob.size >= file.size)) {
      return file;
    }
    const name = file.name.replace(/\.[^.]*$/, '') || 'factura';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** Qué falla en la selección de archivos de una factura (hasta 5 fotos o un PDF); nulo si está bien. */
export function invoiceFilesProblem(files: { type: string; name: string }[]): string | null {
  if (files.length === 0) {
    return 'Toma una foto de la factura o elige su PDF.';
  }
  const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')).length;
  if (pdfs > 0 && files.length > 1) {
    return 'Sube un solo PDF por factura, o solo fotos.';
  }
  if (files.length > 5) {
    return 'Sube máximo 5 fotos por factura.';
  }
  return null;
}
