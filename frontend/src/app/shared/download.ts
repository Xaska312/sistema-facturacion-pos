import { HttpResponse } from '@angular/common/http';

/**
 * Nombre de archivo de un encabezado Content-Disposition. Prefiere {@code filename*} (UTF-8, RFC 5987) sobre
 * {@code filename}.
 */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) {
    return fallback;
  }
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim().replace(/^"|"$/g, ''));
    } catch {
      return fallback;
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header);
  return plain ? plain[1].trim() : fallback;
}

/** Guarda en el equipo un archivo descargado con HttpClient ({@code responseType: 'blob'}). */
export function saveDownload(response: HttpResponse<Blob>, fallback: string): void {
  if (!response.body) {
    return;
  }
  const name = filenameFromDisposition(response.headers.get('Content-Disposition'), fallback);
  const url = URL.createObjectURL(response.body);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
