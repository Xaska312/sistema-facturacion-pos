#!/usr/bin/env node
// Genera la migración de plataforma con todos los municipios de Colombia (decisión 328) desde el CSV de DIVIPOLA
// de datos.gov.co ("DIVIPOLA - Códigos municipios", https://www.datos.gov.co/d/gdxc-w37w).
//
// Uso: node tools/divipola-sql.mjs <archivo.csv> > backend/src/main/resources/db/platform/V26__all_cities.sql
//
// Busca las columnas por su nombre (código del departamento, código del municipio y nombre del municipio), pasa los
// nombres de MAYÚSCULAS a nombre propio en español y no toca los municipios que ya existen (las capitales de V3).
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Uso: node tools/divipola-sql.mjs <archivo.csv>');
  process.exit(1);
}

/** Lee un CSV con comillas (separado por coma o punto y coma). */
function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.slice(0, clean.indexOf('\n'));
  const sep = (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const rows = parseCsv(readFileSync(file, 'utf8'));
const header = rows[0].map(norm);
const find = (...keys) => header.findIndex((h) => keys.some((k) => h.includes(k)));
const findName = (...keys) => header.findIndex((h) => !h.includes('cod') && keys.some((k) => h.includes(k)));
const colDept = find('codigodepartamento', 'coddpto', 'codigodpto', 'dptoccdgo');
const colCity = find('codigomunicipio', 'codmpio', 'codigompio', 'mpioccdgo', 'codigodivipola');
const colName = findName('nombremunicipio', 'nommpio', 'nombrempio', 'mpiocnmbr', 'municipio');
if (colCity < 0 || colName < 0) {
  console.error(`No encontré las columnas del código y el nombre del municipio. Encabezado: ${rows[0].join(' | ')}`);
  process.exit(1);
}

const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en']);
/** "SAN JOSÉ DE CÚCUTA" → "San José de Cúcuta"; deja como está un nombre que ya viene en minúsculas y mayúsculas. */
function properName(raw) {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().split(' ').map((w, i) => {
    if (i > 0 && SMALL.has(w)) return w;
    return w.split(/([-(.])/).map((p) => (p.length > 0 && /\p{L}/u.test(p[0]) ? p[0].toUpperCase() + p.slice(1) : p)).join('');
  }).join(' ');
}

const cities = new Map();
for (const r of rows.slice(1)) {
  const digits = (r[colCity] ?? '').replace(/\D/g, '');
  if (!digits) continue;
  const code = digits.padStart(5, '0');
  const dept = colDept >= 0 ? (r[colDept] ?? '').replace(/\D/g, '').padStart(2, '0') : code.slice(0, 2);
  if (code.length !== 5 || dept !== code.slice(0, 2)) {
    console.error(`Fila rara, la salto: ${r.join(' | ')}`);
    continue;
  }
  cities.set(code, properName(r[colName] ?? ''));
}
if (cities.size < 1000) {
  console.error(`Solo encontré ${cities.size} municipios; esperaba unos 1.100. Revisa el archivo.`);
  process.exit(1);
}

const sql = (s) => `'${s.replace(/'/g, "''")}'`;
const values = [...cities.entries()].sort(([a], [b]) => a.localeCompare(b))
  .map(([code, name]) => `    (${sql(code)}, ${sql(code.slice(0, 2))}, ${sql(name)})`);
process.stdout.write(`-- =====================================================================
-- Decisión 328: todos los municipios de Colombia (${cities.size}) según DIVIPOLA del DANE (datos.gov.co).
-- Generado con tools/divipola-sql.mjs. Las capitales de V3 se dejan como están.
-- =====================================================================

INSERT INTO platform.cities (code, department_code, name) VALUES
${values.join(',\n')}
ON CONFLICT (code) DO NOTHING;
`);
