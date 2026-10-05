#!/usr/bin/env node
// Revisa que los templates y estilos del frontend no usen colores literales (slate-*, white, blue-*, #hex, rgb()…).
// Los colores van por tokens (src/styles.css) para que el modo oscuro funcione en todas las pantallas.
//
// Uso: node tools/check-colors.mjs            (desde la raíz del repo)
//      npm run check:colors                    (desde frontend/)
// Sale con código 1 si encuentra alguno. Una línea puede excluirse con el comentario "color-literal-ok"
// explicando el motivo (p. ej. el tiquete impreso, que siempre es negro sobre blanco).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'frontend', 'src', 'app');

/** Archivos que definen la paleta o imprimen en papel: pueden tener colores literales. */
const ALLOWED_FILES = new Set([
  'core/theme/app-preset.ts', // la paleta de PrimeNG (debe coincidir con src/styles.css)
  'shared/receipt/receipt.component.ts', // el tiquete térmico se imprime siempre en negro sobre blanco
]);

const PALETTES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
  'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];
const UTILITIES = 'bg|text|border|border-[trblxy]|ring|ring-offset|divide|outline|fill|stroke|from|via|to|accent|caret|decoration|placeholder|shadow';

const RULES = [
  { name: 'paleta de Tailwind', pattern: new RegExp(`\\b(?:${UTILITIES})-(?:${PALETTES.join('|')})-\\d{2,3}\\b`) },
  { name: 'blanco/negro literal', pattern: new RegExp(`\\b(?:${UTILITIES})-(?:white|black)\\b`) },
  { name: 'color hexadecimal', pattern: /#[0-9a-fA-F]{3,8}\b(?![\w-])/ },
  { name: 'rgb()/hsl()', pattern: /\b(?:rgba?|hsla?)\(/ },
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(appRoot).filter((f) => /\.(ts|html|css|scss)$/.test(f) && !f.endsWith('.spec.ts'));
const problems = [];

for (const file of files) {
  const rel = relative(appRoot, file).split(sep).join('/');
  if (ALLOWED_FILES.has(rel)) {
    continue;
  }
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes('color-literal-ok')) {
      return;
    }
    for (const rule of RULES) {
      const match = line.match(rule.pattern);
      if (match) {
        problems.push(`${rel}:${index + 1}  ${rule.name}: "${match[0]}"`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(`Se encontraron ${problems.length} colores literales (usa los tokens de src/styles.css):`);
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}
console.log(`Sin colores literales en ${files.length} archivos de frontend/src/app.`);
