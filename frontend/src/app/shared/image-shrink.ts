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
