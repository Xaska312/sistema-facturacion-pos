#!/usr/bin/env node
// Exporta el manual de uso (frontend/src/app/features/manual/manual-content.ts) a
// backend/src/main/resources/aska/manual.json, para que Aska responda cómo se hace algo en XASKA (decisión 357).
//
// Uso: node tools/export-manual.mjs            escribe el JSON
//      node tools/export-manual.mjs --check    sale con código 1 si el JSON no está al día (lo corre CI)
//      npm run export:manual / npm run check:manual   (desde frontend/)

import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(repoRoot, 'frontend', 'src', 'app', 'features', 'manual', 'manual-content.ts');
const target = join(repoRoot, 'backend', 'src', 'main', 'resources', 'aska', 'manual.json');
const glossary = join(repoRoot, 'frontend', 'src', 'app', 'shared', 'help', 'glossary.ts');
// TypeScript es JavaScript puro (funciona igual en Windows, Linux y CI); el manual solo importa el glosario.
const ts = createRequire(join(repoRoot, 'frontend', 'package.json'))('typescript');
const out = mkdtempSync(join(tmpdir(), 'xaska-manual-'));
const js = (file) => ts.transpileModule(readFileSync(file, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
writeFileSync(join(out, 'glossary.mjs'), js(glossary));
writeFileSync(join(out, 'manual.mjs'), js(source).replace(/from '\.\.\/\.\.\/shared\/help\/glossary'/, "from './glossary.mjs'"));
const { MANUAL } = await import(pathToFileURL(join(out, 'manual.mjs')).href);

const sections = [];
for (const chapter of MANUAL) {
  for (const s of chapter.sections) {
    const tips = [...(s.tips ?? [])];
    if (s.table) {
      tips.push(...s.table.rows.map(([a, b]) => `${a}: ${b}`));
    }
    sections.push({ id: s.id, chapter: chapter.title, title: s.title, summary: s.summary, steps: [...(s.steps ?? [])],
      tips, who: s.who ?? null });
  }
}
const json = JSON.stringify(sections, null, 1) + '\n';

if (process.argv.includes('--check')) {
  if (!existsSync(target) || readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== json) {
    console.error('El manual de Aska no está al día: corre "npm run export:manual" en frontend/ y commitea '
      + 'backend/src/main/resources/aska/manual.json.');
    process.exit(1);
  }
  console.log(`Manual de Aska al día (${sections.length} secciones).`);
} else {
  writeFileSync(target, json);
  console.log(`Manual de Aska exportado: ${sections.length} secciones en ${target}`);
}
