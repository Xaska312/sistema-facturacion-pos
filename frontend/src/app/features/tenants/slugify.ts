/** Convierte un nombre comercial en un identificador válido: "Tienda Doña Ana" → "tienda_dona_ana". */
export function slugify(text: string): string {
  let slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 41);
  if (slug && !/^[a-z]/.test(slug)) {
    slug = ('n_' + slug).slice(0, 41);
  }
  return slug;
}
