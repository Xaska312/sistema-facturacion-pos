// Prueba de carga del POS (QA 7-6d) con k6: https://grafana.com/docs/k6/
//
// Simula la hora pico de TIENDAS negocios (50 por defecto, la meta de lanzamiento):
//   - cajeros: 2 por tienda (el dueño en CAJA-1 y un cajero invitado en CAJA-2) leyendo productos con el lector y
//     registrando ventas en efectivo, una cada ~PAUSA_VENTA segundos cada uno (6 s por defecto: unas 5 veces más
//     ritmo que una tienda de barrio en hora pico).
//   - administracion: 1 de cada 5 dueños mirando el tablero, la lista de ventas y las existencias.
//   - exportaciones: 2 descargas por minuto del CSV de ventas (consulta pesada, comparte cupo con la auditoría).
//
// Prepara los negocios en setup() (registro, negocio, 20 productos con existencia, caja abierta), así que cada
// ejecución crea negocios nuevos: correr contra una base de pruebas, nunca contra producción.
// Cómo correrla: loadtest/README.md.

import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import exec from 'k6/execution';

const BASE = (__ENV.BASE_URL || 'http://localhost:8080') + '/api/v1';
// Salud del backend: directo, /actuator/health; detrás de Caddy (servidor de pruebas), /healthz.
const HEALTH = __ENV.HEALTH_URL || (__ENV.BASE_URL || 'http://localhost:8080') + '/actuator/health';
const STORES = Number(__ENV.TIENDAS || 50);
const PRODUCTS = Number(__ENV.PRODUCTOS || 20);
const DURATION = __ENV.DURACION || '10m';
const PACE = Number(__ENV.PAUSA_VENTA || 6);
const RUN = Date.now().toString(36);
const PASSWORD = 'ClaveCarga-2026';

// Ids sembrados en cada negocio nuevo (migraciones V2 y V5 del negocio).
const UND = '01920000-0000-7000-8000-000000000301';
const IVA19 = '01920000-0000-7000-8000-000000000401';
const CAJA_1 = '01920000-0000-7000-8000-000000000201';

export const options = {
  setupTimeout: '30m',
  scenarios: {
    cajeros: { executor: 'constant-vus', exec: 'cajero', vus: STORES * 2, duration: DURATION, gracefulStop: '30s' },
    administracion: {
      executor: 'constant-vus', exec: 'administracion', vus: Math.max(1, Math.round(STORES / 5)), duration: DURATION,
    },
    exportaciones: {
      executor: 'constant-arrival-rate', exec: 'exportacion', rate: 2, timeUnit: '1m', duration: DURATION,
      preAllocatedVUs: 2, maxVUs: 4,
    },
  },
  thresholds: {
    // Menos del 1 % de errores en lo que hace un cajero (el 429 del cupo de exportaciones no cuenta como error).
    'http_req_failed{scenario:cajeros}': ['rate<0.01'],
    'http_req_failed{scenario:administracion}': ['rate<0.01'],
    // Tiempos de respuesta: lo que el cajero siente al cobrar y al leer un código.
    'http_req_duration{nombre:venta}': ['p(95)<800', 'p(99)<2000'],
    'http_req_duration{nombre:lector}': ['p(95)<300'],
    'http_req_duration{nombre:tablero}': ['p(95)<1500'],
    checks: ['rate>0.99'],
    // Solo para que aparezcan en el resumen.
    'http_reqs{nombre:venta}': ['count>0'],
    'http_req_duration{nombre:exportacion}': ['max>=0'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

// ---------------------------------------------------------------- utilidades

function headers(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

function post(path, body, token, nombre, extra) {
  return http.post(BASE + path, JSON.stringify(body), {
    headers: Object.assign(headers(token), extra || {}),
    tags: { nombre: nombre || 'preparacion' },
  });
}

function get(path, token, nombre, params) {
  return http.get(BASE + path, Object.assign({ headers: headers(token), tags: { nombre: nombre || 'preparacion' } }, params || {}));
}

/** En la preparación cualquier respuesta inesperada detiene la prueba con el detalle. */
function expectStatus(res, status, what) {
  if (res.status !== status) {
    fail(`${what}: HTTP ${res.status} ${(res.body || '').toString().substring(0, 300)}`);
  }
  return res.body ? res.json() : null;
}

function key() {
  return `carga-${__VU}-${__ITER}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function register(email, fullName) {
  expectStatus(post('/auth/register', { email, password: PASSWORD, fullName, acceptTerms: true }), 201, `registro de ${email}`);
  return expectStatus(post('/auth/login', { email, password: PASSWORD }), 200, `login de ${email}`).accessToken;
}

function selectTenant(platformToken, tenantId) {
  return expectStatus(post('/auth/select-tenant', { tenantId }, platformToken), 200, 'elegir negocio').accessToken;
}

// ---------------------------------------------------------------- preparación

function prepareStore(i) {
  const tag = `${RUN}_${i}`;
  const ownerPlatform = register(`carga-${tag}@carga.test`, `Dueño ${i}`);
  const tenant = expectStatus(post('/tenants', {
    slug: `carga_${tag}`, legalName: `Tienda Carga ${i} S.A.S.`, tradeName: `Tienda Carga ${i}`, businessType: 'RETAIL',
  }, ownerPlatform), 201, `negocio ${i}`);
  const owner = selectTenant(ownerPlatform, tenant.id);

  const branches = expectStatus(get('/branches?page=0&size=10', owner), 200, 'sucursales');
  const branchId = branches.content.find((b) => b.code === 'PRINCIPAL').id;
  const methods = expectStatus(get('/payment-methods', owner), 200, 'medios de pago');
  const cash = methods.find((m) => m.code === 'CASH').id;
  const caja2 = expectStatus(post('/cash-registers', { branchId, code: 'CAJA-2', name: 'Caja 2' }, owner), 201, 'caja 2');

  // Productos en paralelo (una petición por producto, todas a la vez).
  const requests = [];
  for (let p = 0; p < PRODUCTS; p++) {
    requests.push(['POST', `${BASE}/products`, JSON.stringify({
      sku: `CARGA-${p + 1}`, name: `Producto de carga ${p + 1}`, baseUnitId: UND, taxId: IVA19, cost: 0,
      salePrice: 1000 + 500 * (p % 10), trackInventory: true,
    }), { headers: headers(owner), tags: { nombre: 'preparacion' } }]);
  }
  const products = http.batch(requests).map((res, p) => {
    const product = expectStatus(res, 201, `producto ${p + 1}`);
    return { id: product.id, sku: product.sku, price: Number(product.salePrice) };
  });
  // Existencia de sobra: la prueba mide velocidad, no "existencias insuficientes".
  expectStatus(post('/inventory/initial-balances', {
    branchId, lines: products.map((p) => ({ productId: p.id, quantity: 1000000, unitCost: 500 })),
  }, owner), 201, 'saldo inicial');

  // El dueño vende en CAJA-1; un cajero invitado, en CAJA-2.
  expectStatus(post('/cash/sessions', { cashRegisterId: CAJA_1, openingAmount: 100000 }, owner), 201, 'abrir CAJA-1');
  const roles = expectStatus(get('/roles', owner), 200, 'roles');
  const cashierRole = roles.find((r) => r.code === 'CASHIER').id;
  const cashierEmail = `carga-${tag}-cajero@carga.test`;
  const invitation = expectStatus(post('/members/invitations', {
    email: cashierEmail, roleIds: [cashierRole], branchIds: [branchId],
  }, owner), 201, 'invitar cajero');
  const cashierPlatform = register(cashierEmail, `Cajero ${i}`);
  expectStatus(post('/invitations/accept', { token: invitation.token }, cashierPlatform), 200, 'aceptar invitación');
  const cashier = selectTenant(cashierPlatform, tenant.id);
  expectStatus(post('/cash/sessions', { cashRegisterId: caja2.id, openingAmount: 100000 }, cashier), 201, 'abrir CAJA-2');

  return { owner, cashier, branchId, cash, products };
}

export function setup() {
  const health = http.get(HEALTH);
  if (health.status !== 200) {
    fail(`El backend no responde en ${HEALTH} (HTTP ${health.status}). ¿Está levantado?`);
  }
  const started = Date.now();
  const stores = [];
  for (let i = 1; i <= STORES; i++) {
    stores.push(prepareStore(i));
    if (i % 10 === 0) {
      console.log(`Preparadas ${i} de ${STORES} tiendas (${Math.round((Date.now() - started) / 1000)} s)`);
    }
  }
  return { stores, preparacionSegundos: Math.round((Date.now() - started) / 1000) };
}

// ---------------------------------------------------------------- escenarios

/**
 * Una venta de una de las cajas (dueño en CAJA-1 o cajero en CAJA-2): lee de 1 a 4 productos y cobra en efectivo.
 * La caja sale del número de iteración del escenario y no del número de VU (es global entre escenarios): así cada caja
 * recibe la misma carga.
 */
export function cajero(data) {
  const index = exec.scenario.iterationInTest % (data.stores.length * 2);
  const store = data.stores[Math.floor(index / 2)];
  const token = index % 2 === 0 ? store.owner : store.cashier;

  const items = [];
  let total = 0;
  const lines = randomInt(1, 4);
  for (let l = 0; l < lines; l++) {
    const product = store.products[randomInt(0, store.products.length - 1)];
    const res = get(`/products/lookup?code=${product.sku}`, token, 'lector');
    check(res, { 'lector 200': (r) => r.status === 200 });
    const quantity = randomInt(1, 3);
    items.push({ productId: product.id, quantity });
    total += product.price * quantity;
    sleep(0.3 + Math.random() * 0.7); // el cajero pasa el siguiente producto
  }
  const received = Math.ceil(total / 1000) * 1000 + (Math.random() < 0.5 ? 0 : 10000);
  const sale = post('/sales', { customerId: null, items, payments: [{ paymentMethodId: store.cash, amount: received }] },
    token, 'venta', { 'Idempotency-Key': key() });
  check(sale, {
    'venta 201': (r) => r.status === 201,
    'total correcto': (r) => r.status !== 201 || Number(r.json('total')) === total,
  });
  sleep(PACE * (0.5 + Math.random()));
}

/** Dueños revisando el día: tablero, ventas recientes y existencias. */
export function administracion(data) {
  const store = data.stores[(__VU - 1) % data.stores.length];
  check(get('/reports/dashboard', store.owner, 'tablero'), { 'tablero 200': (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);
  check(get('/sales?page=0&size=20', store.owner, 'lista de ventas'), { 'ventas 200': (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);
  check(get(`/inventory/stock?branchId=${store.branchId}&page=0&size=20&sort=name,asc`, store.owner, 'existencias'),
    { 'existencias 200': (r) => r.status === 200 });
  sleep(10 + Math.random() * 10);
}

/** Exportación del día completo (consulta pesada). 429 = cupo lleno: es la protección esperada, no un error. */
export function exportacion(data) {
  const store = data.stores[Math.floor(Math.random() * data.stores.length)];
  const res = get('/reports/sales.csv', store.owner, 'exportacion', {
    responseCallback: http.expectedStatuses(200, 429),
  });
  check(res, { 'exportación 200 o 429': (r) => r.status === 200 || r.status === 429 });
}

// ---------------------------------------------------------------- resumen en español

function ms(metric, stat) {
  const value = metric && metric.values ? metric.values[stat] : undefined;
  return value === undefined ? '—' : `${Math.round(value)} ms`;
}

function pct(metric) {
  return metric && metric.values ? `${(metric.values.rate * 100).toFixed(2)} %` : '—';
}

export function handleSummary(data) {
  const m = data.metrics;
  const trend = (name) => m[`http_req_duration{nombre:${name}}`];
  const sales = m['http_reqs{nombre:venta}'] || null;
  const failed = Object.entries(data.metrics)
    .filter(([, metric]) => metric.thresholds)
    .flatMap(([name, metric]) => Object.entries(metric.thresholds).filter(([, t]) => !t.ok).map(([rule]) => `${name}: ${rule}`));
  const seconds = data.state.testRunDurationMs / 1000;
  const preparation = (data.setup_data && data.setup_data.preparacionSegundos) || 0;
  const minutes = Math.max(1, seconds - preparation) / 60;
  const lines = [
    '',
    'PRUEBA DE CARGA — POS HÍBRIDO',
    `Tiendas: ${STORES} · cajeros: ${STORES * 2} · productos por tienda: ${PRODUCTS} · duración: ${DURATION} · pausa entre ventas: ~${PACE} s`,
    `Preparación: ${preparation} s · duración total: ${Math.round(seconds)} s`,
    '',
    `Ventas registradas: ${sales ? sales.values.count : '—'} (${sales ? (sales.values.count / minutes).toFixed(0) : '—'} por minuto de prueba)`,
    `Venta  · mediana ${ms(trend('venta'), 'med')} · p95 ${ms(trend('venta'), 'p(95)')} · p99 ${ms(trend('venta'), 'p(99)')} · máx ${ms(trend('venta'), 'max')}`,
    `Lector · mediana ${ms(trend('lector'), 'med')} · p95 ${ms(trend('lector'), 'p(95)')}`,
    `Tablero · mediana ${ms(trend('tablero'), 'med')} · p95 ${ms(trend('tablero'), 'p(95)')}`,
    `Exportación CSV · mediana ${ms(trend('exportacion'), 'med')} · p95 ${ms(trend('exportacion'), 'p(95)')}`,
    `Errores (cajeros): ${pct(m['http_req_failed{scenario:cajeros}'])} · verificaciones correctas: ${pct(m.checks)}`,
    '',
    failed.length === 0 ? 'RESULTADO: APROBADA (se cumplieron todos los umbrales)' : `RESULTADO: NO APROBADA\n  - ${failed.join('\n  - ')}`,
    '',
  ];
  const text = lines.join('\n');
  // Los tokens de la preparación no se guardan en el resultado (se sube como artefacto en Actions).
  delete data.setup_data;
  return {
    stdout: text,
    'resultados/resumen.txt': text,
    'resultados/resumen.json': JSON.stringify(data, null, 2),
  };
}
