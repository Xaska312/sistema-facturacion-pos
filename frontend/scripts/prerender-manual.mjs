#!/usr/bin/env node
// Manual de uso que Google puede leer sin JavaScript (decisión 374). Después de `ng build` toma el index.html de la app,
// le pone el título, la descripción y el enlace canónico del manual y mete dentro de <app-root> todo el manual en HTML
// (src/app/features/manual/manual-content.ts). Caddy sirve ese archivo en /manual: el buscador ve el texto completo en la
// primera respuesta y el navegador arranca Angular igual que siempre, que reemplaza ese contenido por la página normal.
//
// Uso: node scripts/prerender-manual.mjs   (lo corre `npm run build`)

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(frontend, 'dist', 'pos-hibrido-frontend', 'browser');
const indexFile = join(dist, 'index.html');
if (!existsSync(indexFile)) {
  console.error(`No existe ${indexFile}: corre "ng build" antes.`);
  process.exit(1);
}

// El manual es TypeScript: se transpila a JavaScript (igual que tools/export-manual.mjs) y se importa.
const ts = createRequire(join(frontend, 'package.json'))('typescript');
const out = mkdtempSync(join(tmpdir(), 'xaska-manual-html-'));
const js = (file) => ts.transpileModule(readFileSync(file, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
writeFileSync(join(out, 'glossary.mjs'), js(join(frontend, 'src', 'app', 'shared', 'help', 'glossary.ts')));
writeFileSync(join(out, 'manual.mjs'), js(join(frontend, 'src', 'app', 'features', 'manual', 'manual-content.ts'))
  .replace(/from '\.\.\/\.\.\/shared\/help\/glossary'/, "from './glossary.mjs'"));
const { MANUAL } = await import(pathToFileURL(join(out, 'manual.mjs')).href);

const TITLE = 'Manual de uso de XASKA POS · Cómo vender, cobrar, cerrar caja e inventario';
const DESCRIPTION = 'Guía paso a paso de XASKA POS, el punto de venta en la web para negocios en Colombia: '
  + 'vender y cobrar, abrir y cerrar la caja, inventario, fiados, mesas, droguería, reportes y vender sin internet.';
const CANONICAL = 'https://app.xaska.co/manual';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function section(s) {
  const parts = [`<section id="${esc(s.id)}">`, `<h3>${esc(s.title)}</h3>`, `<p>${esc(s.summary)}</p>`];
  if (s.steps?.length) {
    parts.push('<ol>' + s.steps.map((x) => `<li>${esc(x)}</li>`).join('') + '</ol>');
  }
  if (s.table) {
    parts.push('<table><thead><tr>' + s.table.headers.map((h) => `<th>${esc(h)}</th>`).join('') + '</tr></thead><tbody>'
      + s.table.rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('') + '</tbody></table>');
  }
  if (s.tips?.length) {
    parts.push('<ul>' + s.tips.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>');
  }
  if (s.who) {
    parts.push(`<p><strong>Quién:</strong> ${esc(s.who)}</p>`);
  }
  parts.push('</section>');
  return parts.join('');
}

const toc = '<nav aria-label="Contenido del manual"><ol>' + MANUAL.map((c) => `<li><a href="/manual#${esc(c.id)}">${esc(c.title)}</a></li>`).join('')
  + '</ol></nav>';
const body = MANUAL.map((c) => `<article id="${esc(c.id)}"><h2>${esc(c.title)}</h2>${c.sections.map(section).join('')}</article>`).join('');
const sectionCount = MANUAL.reduce((n, c) => n + c.sections.length, 0);

const content = `<div class="manual-static">
<header><p><a href="https://xaska.co">XASKA</a> · <a href="/login">Entrar a XASKA POS</a> · <a href="/registro">Probar gratis 14 días</a></p>
<h1>Manual de uso de XASKA POS</h1>
<p>${esc(DESCRIPTION)}</p></header>
${toc}
<main>${body}</main>
<footer><p>¿No encuentras algo? Escríbenos por WhatsApp al +57 324 556 0729 o a soporte@xaska.co.</p></footer>
</div>`;

const style = `<style>.manual-static{max-width:60rem;margin:0 auto;padding:1.5rem;font-family:system-ui,sans-serif;line-height:1.55;color:#111827}`
  + `.manual-static h2{margin-top:2rem}.manual-static table{border-collapse:collapse}.manual-static td,.manual-static th{border:1px solid #d1d5db;padding:.25rem .5rem;text-align:left}</style>`;

let html = readFileSync(indexFile, 'utf8');
const replaceOnce = (pattern, value, what) => {
  if (!pattern.test(html)) {
    console.error(`No encontré ${what} en index.html.`);
    process.exit(1);
  }
  html = html.replace(pattern, value);
};
replaceOnce(/<title>[^<]*<\/title>/, `<title>${esc(TITLE)}</title>`, '<title>');
replaceOnce(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(DESCRIPTION)}">`,
  'la descripción');
html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(TITLE)}">`)
  .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(DESCRIPTION)}">`)
  .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${CANONICAL}">`);
replaceOnce(/<\/head>/, `<link rel="canonical" href="${CANONICAL}">${style}</head>`, '</head>');
replaceOnce(/<app-root><\/app-root>/, `<app-root>${content}</app-root>`, '<app-root></app-root>');

writeFileSync(join(dist, 'manual.html'), html);
console.log(`Manual para buscadores: ${sectionCount} secciones en ${join(dist, 'manual.html')}`);
