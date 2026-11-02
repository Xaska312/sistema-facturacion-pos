// Prueba de carga del POS (QA 7-6d) con k6: https://grafana.com/docs/k6/
//
// Simula la hora pico de TIENDAS negocios (50 por defecto, la meta de lanzamiento):
//   - cajeros: 2 por tienda (el dueño en CAJA-1 y un cajero invitado en CAJA-2) leyendo productos con el lector y
//     registrando ventas en efectivo, una cada ~PAUSA_VENTA segundos cada uno (6 s por defecto: unas 5 veces más
//     ritmo que una tienda de barrio en hora pico).
//   - administracion: 1 de cada 5 dueños mirando el tablero, la lista de ventas y las existencias.
//   - exportaciones: 2 descargas por minuto del CSV de ventas (consulta pesada, comparte cupo con la auditoría).
//
//   - restaurantes (RESTAURANTES, 0 por defecto; decisión 276): 2 meseros por restaurante abren una mesa, piden por
//     rondas, envían a cocina y la cuenta se cobra con propina; una pantalla de cocina por restaurante avanza las
//     comandas (Nueva → Preparando → Lista → Entregada) mirando el tablero cada ~3 s.
//
// MODO=limite (decisión 276): en vez de una carga fija, los cajeros y meseros suben poco a poco desde cero hasta el
// total durante DURACION y la prueba se detiene sola cuando la venta pasa de 2 s (p95) o fallan más del 5 %: dice
// hasta dónde aguanta el equipo.
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
const RESTAURANTS = Number(__ENV.RESTAURANTES || 0);
const LIMIT_MODE = (__ENV.MODO || 'normal') === 'limite';
const RUN = Date.now().toString(36);
const PASSWORD = 'ClaveCarga-2026';

// Ids sembrados en cada negocio nuevo (migraciones V2 y V5 del negocio).
const UND = '01920000-0000-7000-8000-000000000301';
const IVA19 = '01920000-0000-7000-8000-000000000401';
const CAJA_1 = '01920000-0000-7000-8000-000000000201';

function cashierScenario(exec, vus) {
  return LIMIT_MODE
    ? { executor: 'ramping-vus', exec, startVUs: 0, stages: [{ duration: DURATION, target: vus }], gracefulRampDown: '10s' }
    : { executor: 'constant-vus', exec, vus, duration: DURATION, gracefulStop: '30s' };
}

const scenarios = {
  cajeros: cashierScenario('cajero', STORES * 2),
  administracion: {
    executor: 'constant-vus', exec: 'administracion', vus: Math.max(1, Math.round(STORES / 5)), duration: DURATION,
  },
  exportaciones: {
    executor: 'constant-arrival-rate', exec: 'exportacion', rate: 2, timeUnit: '1m', duration: DURATION,
    preAllocatedVUs: 2, maxVUs: 4,
  },
};
if (RESTAURANTS > 0) {
  scenarios.meseros = cashierScenario('mesero', RESTAURANTS * 2);
  scenarios.cocinas = { executor: 'constant-vus', exec: 'cocina', vus: RESTAURANTS, duration: DURATION };
}

// En modo límite la prueba se detiene sola al pasar el umbral (después de un minuto de margen).
const stop = (rule) => (LIMIT_MODE ? { threshold: rule, abortOnFail: true, delayAbortEval: '1m' } : rule);

export const options = {
  setupTimeout: '60m',
  scenarios,
  thresholds: {
    // Menos del 1 % de errores en lo que hace un cajero (el 429 del cupo de exportaciones no cuenta como error).
    'http_req_failed{scenario:cajeros}': [LIMIT_MODE ? stop('rate<0.05') : 'rate<0.01'],
    'http_req_failed{scenario:administracion}': ['rate<0.01'],
    // Tiempos de respuesta: lo que el cajero siente al cobrar y al leer un código.
    'http_req_duration{nombre:venta}': LIMIT_MODE ? [stop('p(95)<2000')] : ['p(95)<800', 'p(99)<2000'],
    'http_req_duration{nombre:lector}': ['p(95)<300'],
    'http_req_duration{nombre:tablero}': ['p(95)<1500'],
    checks: ['rate>0.99'],
    // Solo para que aparezcan en el resumen.
    'http_reqs{nombre:venta}': ['count>0'],
    'http_req_duration{nombre:exportacion}': ['max>=0'],
    ...(RESTAURANTS > 0 ? {
      'http_req_failed{scenario:meseros}': ['rate<0.01'],
      'http_req_duration{nombre:comanda}': ['p(95)<800'],
      'http_req_duration{nombre:cobro mesa}': ['p(95)<1000'],
      'http_req_duration{nombre:cocina}': ['p(95)<500'],
      'http_reqs{nombre:cobro mesa}': ['count>0'],
    } : {}),
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

function post(path, body, token, nombre, extra, params) {
  return http.post(BASE + path, JSON.stringify(body), Object.assign({
    headers: Object.assign(headers(token), extra || {}),
    tags: { nombre: nombre || 'preparacion' },
  }, params || {}));
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


/** Restaurante: dueño con caja abierta (cobra y ve la cocina), un mesero invitado, 15 productos y 10 mesas. */
function prepareRestaurant(i) {
  const tag = `${RUN}_r${i}`;
  const ownerPlatform = register(`carga-${tag}@carga.test`, `Dueña restaurante ${i}`);
  const tenant = expectStatus(post('/tenants', {
    slug: `carga_${tag}`, legalName: `Restaurante Carga ${i} S.A.S.`, tradeName: `Restaurante Carga ${i}`,
    businessType: 'RESTAURANT',
  }, ownerPlatform), 201, `restaurante ${i}`);
  const owner = selectTenant(ownerPlatform, tenant.id);
  const branches = expectStatus(get('/branches?page=0&size=10', owner), 200, 'sucursales');
  const branchId = branches.content.find((b) => b.code === 'PRINCIPAL').id;
  const methods = expectStatus(get('/payment-methods', owner), 200, 'medios de pago');
  const cash = methods.find((m) => m.code === 'CASH').id;

  const requests = [];
  for (let p = 0; p < 15; p++) {
    requests.push(['POST', `${BASE}/products`, JSON.stringify({
      sku: `PLATO-${p + 1}`, name: `Plato ${p + 1}`, baseUnitId: UND, taxId: IVA19, cost: 0,
      salePrice: 8000 + 2000 * (p % 8), trackInventory: false,
    }), { headers: headers(owner), tags: { nombre: 'preparacion' } }]);
  }
  const products = http.batch(requests).map((res, p) => expectStatus(res, 201, `plato ${p + 1}`).id);
  const zone = expectStatus(post('/dining/zones', { branchId, name: 'Salón' }, owner), 201, 'zona');
  const tables = [];
  for (let t = 1; t <= 10; t++) {
    tables.push(expectStatus(post('/dining/tables', { zoneId: zone.id, name: `${t}` }, owner), 201, `mesa ${t}`).id);
  }
  expectStatus(post('/cash/sessions', { cashRegisterId: CAJA_1, openingAmount: 100000 }, owner), 201, 'abrir caja');

  const roles = expectStatus(get('/roles', owner), 200, 'roles');
  const waiterRole = roles.find((r) => r.code === 'WAITER').id;
  const waiterEmail = `carga-${tag}-mesero@carga.test`;
  const invitation = expectStatus(post('/members/invitations', {
    email: waiterEmail, roleIds: [waiterRole], branchIds: [branchId],
  }, owner), 201, 'invitar mesero');
  const waiterPlatform = register(waiterEmail, `Mesero ${i}`);
  expectStatus(post('/invitations/accept', { token: invitation.token }, waiterPlatform), 200, 'aceptar invitación');
  const waiter = selectTenant(waiterPlatform, tenant.id);
  return { owner, waiter, cash, products, tables };
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
  const restaurants = [];
  for (let i = 1; i <= RESTAURANTS; i++) {
    restaurants.push(prepareRestaurant(i));
    if (i % 10 === 0) {
      console.log(`Preparados ${i} de ${RESTAURANTS} restaurantes (${Math.round((Date.now() - started) / 1000)} s)`);
    }
  }
  return { stores, restaurants, preparacionSegundos: Math.round((Date.now() - started) / 1000) };
}

// ---------------------------------------------------------------- escenarios

/**
 * La primera vuelta de cada cajero o mesero empieza en un momento al azar dentro de una pausa: en un negocio real las
 * cajas no cobran todas en el mismo segundo, y sin esto los primeros segundos miden una avalancha que no existe.
 */
function staggerStart() {
  if (exec.vu.iterationInScenario === 0) {
    sleep(Math.random() * PACE);
  }
}

/**
 * Una venta de una de las cajas (dueño en CAJA-1 o cajero en CAJA-2): lee de 1 a 4 productos y cobra en efectivo.
 * La caja sale del número de iteración del escenario y no del número de VU (es global entre escenarios): así cada caja
 * recibe la misma carga.
 */
export function cajero(data) {
  staggerStart();
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

/**
 * Un mesero atiende sus 5 mesas (la mitad de las del restaurante, sin cruzarse con el otro): abre la cuenta, pide
 * 1 a 3 rondas que salen a cocina y la dueña la cobra en efectivo con el 10 % de propina.
 */
export function mesero(data) {
  staggerStart();
  const index = exec.scenario.iterationInTest;
  const slot = index % (data.restaurants.length * 2);
  const place = data.restaurants[Math.floor(slot / 2)];
  const half = slot % 2;
  const round = Math.floor(index / (data.restaurants.length * 2));
  const table = place.tables[half * 5 + (round % 5)];
  const token = half === 0 ? place.owner : place.waiter;

  const open = post('/tabs', { kind: 'TABLE', tableId: table, guests: randomInt(1, 6) }, token, 'abrir mesa');
  if (!check(open, { 'mesa abierta': (r) => r.status === 201 })) {
    sleep(PACE);
    return; // la mesa quedó abierta en la vuelta anterior (cobro fallido): la siguiente vuelta usa otra
  }
  const tab = open.json('id');
  const rounds = randomInt(1, 3);
  for (let r = 0; r < rounds; r++) {
    const items = [];
    for (let l = randomInt(1, 4); l > 0; l--) {
      items.push({ productId: place.products[randomInt(0, place.products.length - 1)], quantity: randomInt(1, 2) });
    }
    check(post(`/tabs/${tab}/items`, { items }, token, 'comanda'), { 'pedido 200': (x) => x.status === 200 });
    check(post(`/tabs/${tab}/send`, {}, token, 'comanda'), { 'a cocina 200': (x) => x.status === 200 });
    sleep(PACE * (0.5 + Math.random()));
  }
  const current = get(`/tabs/${tab}`, token, 'ver mesa');
  const total = Number(current.json('total'));
  const tip = Math.round(total * 0.1 / 100) * 100;
  const charge = post(`/tabs/${tab}/charge`, {
    expectedTotal: total, payments: [{ paymentMethodId: place.cash, amount: Math.ceil((total + tip) / 1000) * 1000 }],
    tip: tip > 0 ? { amount: tip, paymentMethodId: place.cash, suggestedPercent: 10 } : null,
  }, place.owner, 'cobro mesa', { 'Idempotency-Key': key() });
  check(charge, { 'mesa cobrada 201': (r) => r.status === 201 });
  sleep(PACE * (0.5 + Math.random()));
}

/** Pantalla de cocina: mira el tablero y avanza cada comanda un estado. */
export function cocina(data) {
  const place = data.restaurants[(__VU - 1) % data.restaurants.length];
  const board = get('/kitchen/board', place.owner, 'cocina');
  check(board, { 'tablero cocina 200': (r) => r.status === 200 });
  const next = { NEW: 'PREPARING', PREPARING: 'READY', READY: 'DELIVERED' };
  for (const ticket of (board.status === 200 ? board.json() : []).slice(0, 6)) {
    if (next[ticket.status]) {
      // 409: el otro cocinero (o el mesero) ya la movió; es normal, no cuenta como error.
      post(`/kitchen/tickets/${ticket.id}/status`, { status: next[ticket.status] }, place.owner, 'cocina estado',
        undefined, { responseCallback: http.expectedStatuses(200, 409) });
    }
  }
  sleep(2 + Math.random() * 2);
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
    `Modo: ${LIMIT_MODE ? 'límite (sube hasta romper)' : 'carga fija'} · tiendas: ${STORES} · cajeros: ${STORES * 2} · productos por tienda: ${PRODUCTS} · duración: ${DURATION} · pausa entre ventas: ~${PACE} s`,
    `Preparación: ${preparation} s · duración total: ${Math.round(seconds)} s`,
    '',
    `Ventas registradas: ${sales ? sales.values.count : '—'} (${sales ? (sales.values.count / minutes).toFixed(0) : '—'} por minuto de prueba)`,
    `Venta  · mediana ${ms(trend('venta'), 'med')} · p95 ${ms(trend('venta'), 'p(95)')} · p99 ${ms(trend('venta'), 'p(99)')} · máx ${ms(trend('venta'), 'max')}`,
    `Lector · mediana ${ms(trend('lector'), 'med')} · p95 ${ms(trend('lector'), 'p(95)')}`,
    `Tablero · mediana ${ms(trend('tablero'), 'med')} · p95 ${ms(trend('tablero'), 'p(95)')}`,
    `Exportación CSV · mediana ${ms(trend('exportacion'), 'med')} · p95 ${ms(trend('exportacion'), 'p(95)')}`,
    `Errores (cajeros): ${pct(m['http_req_failed{scenario:cajeros}'])} · verificaciones correctas: ${pct(m.checks)}`,
    ...(RESTAURANTS > 0 ? [
      `Restaurantes: ${RESTAURANTS} · meseros: ${RESTAURANTS * 2} · mesas cobradas: ${m['http_reqs{nombre:cobro mesa}'] ? m['http_reqs{nombre:cobro mesa}'].values.count : '—'}`,
      `Comanda · p95 ${ms(trend('comanda'), 'p(95)')} · Cobro de mesa · p95 ${ms(trend('cobro mesa'), 'p(95)')} · Tablero de cocina · p95 ${ms(trend('cocina'), 'p(95)')}`,
      `Errores (meseros): ${pct(m['http_req_failed{scenario:meseros}'])}`,
    ] : []),
    ...(LIMIT_MODE ? [
      '',
      `MODO LÍMITE: llegó a ${m.vus_max ? m.vus_max.values.max : '—'} usuarios virtuales a la vez`
        + ` (${m.vus ? m.vus.values.max : '—'} activos al final) de ${STORES * 2 + RESTAURANTS * 2} previstos.`,
      data.state.testRunDurationMs / 1000 < preparation + 60
        ? 'Se detuvo casi al empezar: revisa el backend.'
        : 'Si se detuvo antes de terminar, ese número es lo que aguanta este equipo con venta p95 < 2 s.',
    ] : []),
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
