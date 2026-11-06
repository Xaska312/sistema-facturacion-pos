#!/usr/bin/env node
// Prueba la lectura de facturas con IA (decisión 295) con facturas reales, ANTES de prenderla en producción.
// Usa las mismas instrucciones y el mismo formato que el backend (backend/src/main/resources/ai/).
//
// Uso (desde la raíz del repo, en PowerShell):
//   $env:ANTHROPIC_API_KEY = "<tu clave>"      (solo en esa ventana; no la guardes en el repo)
//   node tools/leer-facturas.mjs C:\ruta\a\facturas-de-prueba
//
// En la carpeta: cada archivo .jpg, .png o .pdf es una factura; cada subcarpeta es UNA factura en varias fotos.
// Deja en <carpeta>\resultados un .json por factura y resumen.csv para comparar contra el papel.
// La carpeta de facturas va FUERA del repo: son datos reales de proveedores.

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const resources = join(repoRoot, 'backend', 'src', 'main', 'resources', 'ai');
const prompt = readFileSync(join(resources, 'invoice-prompt.txt'), 'utf8');
const schema = JSON.parse(readFileSync(join(resources, 'invoice-schema.json'), 'utf8'));
const model = process.env.AI_INVOICE_MODEL || 'claude-haiku-5-5';
const key = process.env.ANTHROPIC_API_KEY;
const folder = process.argv[2];

if (!key || !folder) {
  console.error('Uso: con ANTHROPIC_API_KEY en el entorno, node tools/leer-facturas.mjs <carpeta de facturas>');
  process.exit(1);
}

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' };

/** Facturas de la carpeta: [{nombre, archivos[]}]. */
function invoices(dir) {
  const list = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (name === 'resultados') continue;
    if (statSync(path).isDirectory()) {
      const files = readdirSync(path).sort().filter((f) => TYPES[extname(f).toLowerCase()]).map((f) => join(path, f));
      if (files.length) list.push({ name, files });
    } else if (TYPES[extname(name).toLowerCase()]) {
      list.push({ name: basename(name, extname(name)), files: [path] });
    }
  }
  return list;
}

async function read(files) {
  const content = files.map((f) => {
    const mediaType = TYPES[extname(f).toLowerCase()];
    const data = readFileSync(f);
    if (mediaType !== 'application/pdf' && data.length > 5 * 1024 * 1024) {
      console.warn(`  ${basename(f)} pesa más de 5 MB: la app la reduce antes de enviarla; aquí puede fallar.`);
    }
    return { type: mediaType === 'application/pdf' ? 'document' : 'image',
      source: { type: 'base64', media_type: mediaType, data: data.toString('base64') } };
  });
  content.push({ type: 'text', text: files.length > 1
    ? `Estas ${files.length} fotos son de la misma factura. Léela.` : 'Lee esta factura.' });
  const started = Date.now();
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 8000, system: prompt, messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema } } }),
  });
  const body = await response.json();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!response.ok) {
    return { seconds, error: `${response.status}: ${body?.error?.message ?? 'sin detalle'}` };
  }
  const text = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let invoice = null;
  try { invoice = JSON.parse(text); } catch { /* queda como no leída */ }
  return { seconds, stop: body.stop_reason, usage: body.usage, invoice };
}

const out = join(folder, 'resultados');
mkdirSync(out, { recursive: true });
const rows = [['factura', 'fotos', 'segundos', 'leida', 'problema', 'proveedor', 'nit', 'numero', 'fecha', 'total',
  'lineas', 'suma_lineas_sin_iva', 'tokens_entrada', 'tokens_salida']];
for (const inv of invoices(folder)) {
  process.stdout.write(`${inv.name} (${inv.files.length} archivo(s))... `);
  const r = await read(inv.files);
  writeFileSync(join(out, `${inv.name}.json`), JSON.stringify(r, null, 2));
  const i = r.invoice ?? {};
  const sum = (i.lines ?? []).reduce((s, l) => s + (l.quantity || 0) * (l.unitCost || 0), 0);
  rows.push([inv.name, inv.files.length, r.seconds, i.readable ?? false, r.error ?? i.problem ?? '', i.supplier?.name ?? '',
    i.supplier?.nit ?? '', i.invoiceNumber ?? '', i.issueDate ?? '', i.total ?? '', (i.lines ?? []).length,
    Math.round(sum), r.usage?.input_tokens ?? '', r.usage?.output_tokens ?? '']);
  console.log(r.error ? `error ${r.error}` : `${i.readable ? 'leída' : 'no leída'}, ${(i.lines ?? []).length} líneas, ${r.seconds} s`);
}
const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
writeFileSync(join(out, 'resumen.csv'), '\ufeff' + csv);
console.log(`Listo: ${join(out, 'resumen.csv')}`);
