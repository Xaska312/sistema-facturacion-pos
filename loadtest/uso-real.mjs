// Uso real simulado (decisión 276): un día completo de una tienda y de un restaurante, como lo haría un cliente, con
// cuentas hechas a mano. Al final compara lo que dice el sistema (caja, inventario, fiado, reportes, propinas) con lo
// que debería decir. Si algo no cuadra, lo muestra. No usa librerías (Node 20 o más nuevo).
//
//   node loadtest/uso-real.mjs                     # contra http://localhost:8080
//
// Crea negocios de prueba: correr contra una base de pruebas (proyecto aparte de Docker, loadtest/README.md), nunca
// contra producción. Sale con código 1 si algo no cuadró.

import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const API = BASE + '/api/v1';
const RUN = Date.now().toString(36);
const PASSWORD = 'ClaveUsoReal-2026';
const CAJA_1 = '01920000-0000-7000-8000-000000000201';
const UND = '01920000-0000-7000-8000-000000000301';
const IVA19 = '01920000-0000-7000-8000-000000000401';
const CASH = '01920000-0000-7000-8000-000000000701';
const CARD = '01920000-0000-7000-8000-000000000702';
const TRANSFER = '01920000-0000-7000-8000-000000000703';
const CREDIT = '01920000-0000-7000-8000-000000000704';

const results = [];
let day = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = () => `uso-${randomUUID()}`;

async function call(method, path, { token, body, cookie, headers = {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (cookie) h.Cookie = cookie;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    if (res.status === 429 && attempt < 4) {
      const wait = Number(res.headers.get('retry-after') || 10);
      console.log(`   (límite de solicitudes: espero ${wait} s)`);
      await sleep((wait + 1) * 1000);
      continue;
    }
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* no es JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }
}

/** Un paso del día: si no responde lo esperado, se registra y se detiene ese día (lo demás dependería de él). */
async function step(what, promise, status) {
  const res = await promise;
  if (res.status !== status) {
    results.push({ dia: day, prueba: what, ok: false, detalle: `HTTP ${res.status} ${res.text.slice(0, 200)}` });
    throw new Error(`${what}: HTTP ${res.status} ${res.text.slice(0, 200)}`);
  }
  return res.json;
}

/** Compara una cifra del sistema con la cuenta hecha a mano. */
function verify(what, actual, expected) {
  const ok = Number(actual) === Number(expected);
  results.push({ dia: day, prueba: what, ok, detalle: ok ? '' : `el sistema dice ${actual}, debería ser ${expected}` });
  console.log(`${ok ? ' ✔' : ' ✘'} ${what}${ok ? '' : `: el sistema dice ${actual}, debería ser ${expected}`}`);
}

function cookieOf(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return raw.map((c) => c.split(';')[0]).find((c) => c.includes('=')) || null;
}

async function register(label) {
  const email = `uso-${RUN}-${label}@uso.test`.toLowerCase();
  await step(`registro ${label}`, call('POST', '/auth/register', {
    body: { email, password: PASSWORD, fullName: label, acceptTerms: true } }), 201);
  const res = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
  if (res.status !== 200) throw new Error(`login ${label}: HTTP ${res.status}`);
  return { email, token: res.json.accessToken, cookie: cookieOf(res) };
}

async function enter(user, tenantId) {
  const res = await call('POST', '/auth/select-tenant', { token: user.token, cookie: user.cookie, body: { tenantId } });
  if (res.status !== 200) throw new Error(`elegir negocio: HTTP ${res.status} ${res.text.slice(0, 200)}`);
  return { ...user, token: res.json.accessToken, cookie: cookieOf(res) || user.cookie, tenantId };
}

async function refresh(user) {
  const res = await call('POST', '/auth/refresh', { cookie: user.cookie });
  if (res.status !== 200) throw new Error(`renovar sesión: HTTP ${res.status}`);
  return { ...user, token: res.json.accessToken, cookie: cookieOf(res) || user.cookie };
}

async function business(label, type, modules) {
  const user = await register(`dueno-${label}`);
  const tenant = await step(`crear ${label}`, call('POST', '/tenants', {
    token: user.token, body: { slug: `uso_${label}_${RUN}`, legalName: `${label} S.A.S.`, tradeName: label, businessType: type } }), 201);
  let owner = await enter(user, tenant.id);
  if (modules) {
    const profile = await step('perfil', call('GET', '/business-profile', { token: owner.token }), 200);
    await step('módulos', call('PUT', '/business-profile', {
      token: owner.token, body: { businessType: type, modules: [...new Set([...profile.modules, ...modules])] } }), 200);
    owner = await refresh(owner);
  }
  const branches = await step('sucursales', call('GET', '/branches?size=10', { token: owner.token }), 200);
  return { owner, branchId: branches.content[0].id };
}

async function invite(owner, branchId, label, roleCode) {
  const roles = await step('roles', call('GET', '/roles', { token: owner.token }), 200);
  const user = await register(label);
  const inv = await step(`invitar ${label}`, call('POST', '/members/invitations', {
    token: owner.token, body: { email: user.email, roleIds: [roles.find((r) => r.code === roleCode).id], branchIds: [branchId] } }), 201);
  await step(`aceptar ${label}`, call('POST', '/invitations/accept', { token: user.token, body: { token: inv.token } }), 200);
  return enter(user, owner.tenantId);
}

async function product(token, sku, name, price, branchId, stock) {
  const p = await step(`producto ${sku}`, call('POST', '/products', {
    token, body: { sku, name, baseUnitId: UND, taxId: IVA19, cost: 0, salePrice: price, trackInventory: stock !== undefined } }), 201);
  if (stock !== undefined) {
    await step(`existencia ${sku}`, call('POST', '/inventory/initial-balances', {
      token, body: { branchId, lines: [{ productId: p.id, quantity: stock, unitCost: Math.round(price / 2) }] } }), 201);
  }
  return p.id;
}

function sell(token, items, payments, customerId = null) {
  return call('POST', '/sales', {
    token, headers: { 'Idempotency-Key': key() },
    body: { customerId, items: items.map(([productId, quantity, discountPercent]) => ({ productId, quantity, discountPercent })),
      payments: payments.map(([paymentMethodId, amount]) => ({ paymentMethodId, amount })) } });
}

const stockOf = async (token, branchId, productId) => (await step('existencia', call('GET',
  `/inventory/balance?branchId=${branchId}&productId=${productId}`, { token }), 200)).quantity;

// ------------------------------------------------------------------------------------------------ tienda

async function storeDay() {
  day = 'Tienda';
  console.log('\n== Un día en la tienda (dueña y cajero, fiado)');
  const { owner, branchId } = await business('tienda', 'RETAIL', ['CREDIT']);
  const arroz = await product(owner.token, 'ARROZ', 'Arroz 500 g', 2000, branchId, 100);
  const aceite = await product(owner.token, 'ACEITE', 'Aceite 1 L', 5000, branchId, 50);
  const cafe = await product(owner.token, 'CAFE', 'Café 500 g', 12000, branchId, 20);
  const ana = (await step('cliente con fiado', call('POST', '/customers', {
    token: owner.token, body: { personType: 'NATURAL', documentType: 'CC', documentNumber: `7${Date.now() % 100000000}`,
      firstNames: 'Ana', lastNames: 'Gómez', creditLimit: 50000 } }), 201)).id;
  const cashier = await invite(owner, branchId, 'cajero-tienda', 'CASHIER');
  const c = cashier.token;

  const session = (await step('el cajero abre la caja con $50.000', call('POST', '/cash/sessions', {
    token: c, body: { cashRegisterId: CAJA_1, openingAmount: 50000 } }), 201)).id;

  // Ventas del día (precios con IVA incluido).
  const s1 = await step('venta 1: 3 arroz + 1 aceite, paga con $20.000', sell(c, [[arroz, 3], [aceite, 1]], [[CASH, 20000]]), 201);
  verify('Venta 1: total $11.000', s1.total, 11000);
  verify('Venta 1: vueltas $9.000', s1.changeAmount, 9000);
  await step('venta 2: 2 café con tarjeta', sell(c, [[cafe, 2]], [[CARD, 24000]]), 201);
  await step('venta 3: 2 aceite + 1 café, mitad efectivo y mitad Nequi', sell(c, [[aceite, 2], [cafe, 1]], [[CASH, 10000], [TRANSFER, 12000]]), 201);
  const s4 = await step('venta 4: 5 arroz en efectivo', sell(c, [[arroz, 5]], [[CASH, 10000]]), 201);
  await step('venta 5: 1 café fiado a Ana', sell(c, [[cafe, 1]], [[CREDIT, 12000]], ana), 201);
  // La dueña vende en su propia caja (CAJA-2): el descuento solo lo puede dar quien tiene permiso.
  const caja2 = await step('la dueña crea la CAJA-2', call('POST', '/cash-registers', {
    token: owner.token, body: { branchId, code: 'CAJA-2', name: 'Caja 2' } }), 201);
  await step('la dueña abre la CAJA-2 en $0', call('POST', '/cash/sessions', {
    token: owner.token, body: { cashRegisterId: caja2.id, openingAmount: 0 } }), 201);
  const s6 = await step('venta 6 (dueña, 10 % de descuento): 10 arroz con tarjeta', call('POST', '/sales', {
    token: owner.token, headers: { 'Idempotency-Key': key() },
    body: { items: [{ productId: arroz, quantity: 10, discountPercent: 10 }], payments: [{ paymentMethodId: CARD, amount: 18000 }] } }), 201);
  verify('Venta 6: 10 arroz con 10 % = $18.000', s6.total, 18000);
  const discount = await sell(c, [[arroz, 1, 50]], [[CASH, 1000]]);
  verify('El cajero no puede dar 50 % de descuento', discount.status === 201 ? 0 : 1, 1);

  await step('la dueña anula la venta 4 (devolución en efectivo)', call('POST', `/sales/${s4.id}/void`, {
    token: owner.token, body: { reason: 'El cliente devolvió el arroz' } }), 200);
  await step('ingreso de $10.000 (sencillo)', call('POST', `/cash/sessions/${session}/movements`, {
    token: c, headers: { 'Idempotency-Key': key() }, body: { type: 'INCOME', amount: 10000, reason: 'Sencillo' } }), 201);
  await step('egreso de $3.000 (bolsas)', call('POST', `/cash/sessions/${session}/movements`, {
    token: c, headers: { 'Idempotency-Key': key() }, body: { type: 'EXPENSE', amount: 3000, reason: 'Bolsas' } }), 201);
  await step('Ana abona $5.000 en efectivo', call('POST', `/credit/accounts/${ana}/payments`, {
    token: c, headers: { 'Idempotency-Key': key() }, body: { amount: 5000, paymentMethodId: CASH } }), 201);

  // Cuentas a mano.
  const expectedCash = 50000 + 11000 + 10000 + 10000 - 10000 + 10000 - 3000 + 5000;
  // El cajero cierra a ciegas (no ve el esperado): el informe lo mira la dueña.
  const blind = await step('informe del cajero', call('GET', `/cash/sessions/${session}/report`, { token: c }), 200);
  verify('El cajero no ve el efectivo esperado antes de cerrar (cierre ciego)', blind.cash.expected == null ? 1 : 0, 1);
  const report = await step('informe de caja', call('GET', `/cash/sessions/${session}/report`, { token: owner.token }), 200);
  verify('Efectivo esperado en la caja', report.cash.expected, expectedCash);
  verify('Ventas en efectivo (sin vueltas)', report.cash.sales, 31000);
  verify('Devolución por anulación', Math.abs(report.cash.voidRefunds), 10000);
  verify('Abonos de fiado en la caja', report.cash.creditPayments, 5000);

  verify('Existencia de arroz (100 − 3 − 5 + 5 devueltos − 10)', await stockOf(owner.token, branchId, arroz), 87);
  verify('Existencia de aceite (50 − 1 − 2)', await stockOf(owner.token, branchId, aceite), 47);
  verify('Existencia de café (20 − 2 − 1 − 1)', await stockOf(owner.token, branchId, cafe), 16);

  const account = await step('cuenta de Ana', call('GET', `/credit/accounts/${ana}`, { token: owner.token }), 200);
  verify('Ana debe $12.000 − $5.000', account.balance, 7000);

  const summary = await step('resumen de ventas de hoy', call('GET', '/reports/sales/summary', { token: owner.token }), 200);
  verify('Ventas válidas del día (sin la anulada)', summary.salesCount, 5);
  verify('Total vendido del día', summary.total, 11000 + 24000 + 22000 + 12000 + 18000);

  const closed = await step('el cajero cierra contando lo esperado', call('POST', `/cash/sessions/${session}/close`, {
    token: c, body: { countedAmount: expectedCash } }), 200);
  const z = await step('informe Z', call('GET', `/cash/sessions/${session}/report`, { token: owner.token }), 200);
  verify('Cierre sin diferencia', z.cash.difference, 0);
  verify('La caja quedó cerrada', closed.status === 'CLOSED' || z.session.status === 'CLOSED' ? 1 : 0, 1);

  const consistency = await call('GET', '/inventory/consistency', { token: owner.token });
  verify('Inventario consistente (libro de movimientos = saldos)', consistency.status === 200
    && !/"(inconsistent|mismatches|differences)"\s*:\s*\[\s*\{/.test(consistency.text) ? 1 : 0, 1);
}

// ------------------------------------------------------------------------------------------------ restaurante

async function restaurantDay() {
  day = 'Restaurante';
  console.log('\n== Un día en el restaurante (mesero, cocina, cuenta dividida, propinas)');
  const { owner, branchId } = await business('restaurante', 'RESTAURANT');
  const o = owner.token;
  const burger = await product(o, 'HAMB', 'Hamburguesa', 18000);
  const soda = await product(o, 'GASEOSA', 'Gaseosa', 4000);
  const fries = await product(o, 'PAPAS', 'Papas', 6000);
  const zone = await step('zona', call('POST', '/dining/zones', { token: o, body: { branchId, name: 'Salón' } }), 201);
  const mesa1 = (await step('mesa 1', call('POST', '/dining/tables', { token: o, body: { zoneId: zone.id, name: '1' } }), 201)).id;
  const waiter = await invite(owner, branchId, 'mesero', 'WAITER');
  const w = waiter.token;
  const session = (await step('la dueña abre la caja con $100.000', call('POST', '/cash/sessions', {
    token: o, body: { cashRegisterId: CAJA_1, openingAmount: 100000 } }), 201)).id;

  const tab = (await step('el mesero abre la mesa 1 (4 personas)', call('POST', '/tabs', {
    token: w, body: { kind: 'TABLE', tableId: mesa1, guests: 4 } }), 201)).id;
  await step('pide 2 hamburguesas y 2 gaseosas', call('POST', `/tabs/${tab}/items`, {
    token: w, body: { items: [{ productId: burger, quantity: 2 }, { productId: soda, quantity: 2 }] } }), 200);
  const sent = await step('envía a cocina', call('POST', `/tabs/${tab}/send`, { token: w }), 200);
  for (const status of ['PREPARING', 'READY', 'DELIVERED']) {
    for (const t of sent.tickets.filter((x) => x.status !== 'DELIVERED')) {
      await step(`cocina: comanda #${t.number} → ${status}`, call('POST', `/kitchen/tickets/${t.id}/status`, {
        token: o, body: { status } }), 200);
    }
  }
  await step('segunda ronda: papas', call('POST', `/tabs/${tab}/items`, {
    token: w, body: { items: [{ productId: fries, quantity: 1 }] } }), 200);
  const second = await step('envía la segunda ronda', call('POST', `/tabs/${tab}/send`, { token: w }), 200);

  const before = await step('cuenta de la mesa', call('GET', `/tabs/${tab}`, { token: w }), 200);
  verify('Total de la mesa (2×18.000 + 2×4.000 + 6.000)', before.total, 50000);
  const burgers = before.items.find((i) => i.productId === burger);
  const sodas = before.items.find((i) => i.productId === soda);

  // Dividida por productos: uno paga una hamburguesa y una gaseosa en efectivo con 10 % de propina; el resto, tarjeta.
  const part1 = await step('parte 1: hamburguesa + gaseosa, efectivo $30.000 con propina $2.200', call('POST', `/tabs/${tab}/charge`, {
    token: o, headers: { 'Idempotency-Key': key() },
    body: { items: [{ itemId: burgers.id, quantity: 1 }, { itemId: sodas.id, quantity: 1 }], expectedTotal: 22000,
      payments: [{ paymentMethodId: CASH, amount: 30000 }], tip: { amount: 2200, paymentMethodId: CASH, suggestedPercent: 10 } } }), 201);
  verify('Parte 1: vueltas $30.000 − $22.000 − $2.200', part1.changeAmount, 5800);
  await step('parte 2: el resto con tarjeta y propina $2.800', call('POST', `/tabs/${tab}/charge`, {
    token: o, headers: { 'Idempotency-Key': key() },
    body: { expectedTotal: 28000, payments: [{ paymentMethodId: CARD, amount: 30800 }], tip: { amount: 2800, paymentMethodId: CARD } } }), 201);
  const after = await step('cuenta cobrada', call('GET', `/tabs/${tab}`, { token: w }), 200);
  verify('La mesa quedó cobrada', after.status === 'CHARGED' ? 1 : 0, 1);
  const floor = await step('plano de mesas', call('GET', '/dining/floor', { token: w }), 200);
  verify('La mesa 1 quedó libre', floor.zones[0].tables.find((t) => t.id === mesa1).tab ? 0 : 1, 1);

  const takeaway = (await step('pedido para llevar', call('POST', '/tabs', {
    token: w, body: { kind: 'TAKEAWAY', customerName: 'Luis' } }), 201)).id;
  await step('1 hamburguesa para llevar', call('POST', `/tabs/${takeaway}/items`, {
    token: w, body: { items: [{ productId: burger, quantity: 1 }] } }), 200);
  const third = await step('envía a cocina', call('POST', `/tabs/${takeaway}/send`, { token: w }), 200);
  await step('cobro del pedido para llevar en efectivo', call('POST', `/tabs/${takeaway}/charge`, {
    token: o, headers: { 'Idempotency-Key': key() }, body: { expectedTotal: 18000, payments: [{ paymentMethodId: CASH, amount: 18000 }] } }), 201);
  for (const t of [...second.tickets, ...third.tickets].filter((x) => x.status === 'NEW')) {
    for (const status of ['PREPARING', 'READY', 'DELIVERED']) {
      await step(`cocina: comanda #${t.number} → ${status}`, call('POST', `/kitchen/tickets/${t.id}/status`, { token: o, body: { status } }), 200);
    }
  }
  const board = await step('pantalla de cocina', call('GET', '/kitchen/board', { token: o }), 200);
  verify('La cocina quedó sin comandas pendientes', board.length, 0);

  const tips = await step('propinas del día', call('GET', '/tips', { token: o }), 200);
  verify('Propinas recogidas ($2.200 + $2.800)', tips.collected, 5000);
  await step('reparto de las propinas en efectivo entre la dueña y el mesero', call('POST', '/tips/payouts', {
    token: o, body: { branchId, from: tips.from, to: tips.to, amount: 5000, memberIds: tips.people.map((p) => p.memberId), fromCash: true } }), 201);
  verify('No queda propina por repartir', (await step('propinas', call('GET', '/tips', { token: o }), 200)).pending, 0);

  const report = await step('informe de caja', call('GET', `/cash/sessions/${session}/report`, { token: o }), 200);
  verify('Efectivo esperado (100.000 + 22.000 + 2.200 propina + 18.000 − 5.000 reparto)', report.cash.expected, 137200);
  verify('Propinas en efectivo en la caja', report.cash.tips, 2200);
  verify('Reparto de propinas sacado de la caja', Math.abs(report.cash.tipPayouts), 5000);
  const summary = await step('resumen de ventas', call('GET', '/reports/sales/summary', { token: o }), 200);
  verify('Ventas del día (2 partes de la mesa + para llevar)', summary.salesCount, 3);
  verify('Total vendido (sin propinas, que no son del negocio)', summary.total, 68000);
}

// ------------------------------------------------------------------------------------------------ principal

const started = Date.now();
for (const run of [storeDay, restaurantDay]) {
  try {
    await run();
  } catch (e) {
    console.log(` ✘ El día se detuvo: ${e.message}`);
    if (!results.some((r) => !r.ok && r.dia === day)) {
      results.push({ dia: day, prueba: 'El día se detuvo', ok: false, detalle: e.message });
    }
  }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} de ${results.length} comprobaciones cuadraron (${Math.round((Date.now() - started) / 1000)} s).`);
failed.forEach((r) => console.log(` ✘ ${r.dia} — ${r.prueba}: ${r.detalle}`));
mkdirSync(new URL('./resultados/', import.meta.url), { recursive: true });
writeFileSync(new URL('./resultados/uso-real.json', import.meta.url),
  JSON.stringify({ base: BASE, fecha: new Date().toISOString(), resultados: results }, null, 2));
process.exit(failed.length ? 1 : 0);
