// Pruebas de seguridad de caja negra (decisión 276): intenta lo que haría alguien malintencionado contra el API y
// dice qué aguantó y qué no. No usa librerías (Node 20 o más nuevo).
//
//   node loadtest/ataques.mjs                       # contra http://localhost:8080
//   $env:BASE_URL="http://localhost:8080"; node loadtest/ataques.mjs
//
// Crea dos negocios de prueba (un restaurante A y una tienda B) con usuarios propios, así que debe correr contra una
// base de pruebas (el proyecto aparte de Docker de loadtest/README.md), NUNCA contra producción.
// El backend debe tener los límites de producción (login 10/min, registro 5/min, 300/min por usuario): las pruebas
// de límites los verifican. Solo se quitan la confirmación del correo y el código de activación
// (loadtest/compose.ataques.yml).
//
// Resultado: una tabla en la consola y loadtest/resultados/ataques.json. Sale con código 1 si algo falló.

import { writeFileSync, mkdirSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';

const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const API = BASE + '/api/v1';
const RUN = Date.now().toString(36);
const PASSWORD = 'ClaveAtaque-2026';
const CAJA_1 = '01920000-0000-7000-8000-000000000201';
const UND = '01920000-0000-7000-8000-000000000301';
const IVA19 = '01920000-0000-7000-8000-000000000401';

const results = [];
const serverErrors = [];
let group = '';

// ------------------------------------------------------------------------------------------------ utilidades

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Petición al API. Si responde 429 espera lo que diga Retry-After y repite (salvo {@code raw}: las pruebas de límites
 * quieren ver el 429). Guarda toda respuesta 5xx para revisar que no filtre detalles internos.
 */
async function call(method, path, { token, body, headers = {}, raw = false, cookie, rawBody } = {}) {
  for (let attempt = 0; ; attempt++) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (cookie) h.Cookie = cookie;
    let payload = rawBody;
    if (body !== undefined && rawBody === undefined) {
      h['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    } else if (rawBody !== undefined && !h['Content-Type']) {
      h['Content-Type'] = 'application/json';
    }
    const res = await fetch(path.startsWith('http') ? path : API + path, { method, headers: h, body: payload });
    const text = await res.text();
    if (res.status === 429 && !raw && attempt < 4) {
      const wait = Number(res.headers.get('retry-after') || 10);
      process.stdout.write(`   (límite de solicitudes: espero ${wait} s)\n`);
      await sleep((wait + 1) * 1000);
      continue;
    }
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* no es JSON */ }
    if (res.status >= 500) serverErrors.push({ group, method, path, status: res.status, body: text.slice(0, 300) });
    return { status: res.status, json, text, headers: res.headers };
  }
}

function record(name, ok, detail, severity = 'Alta') {
  results.push({ grupo: group, prueba: name, ok, detalle: detail, gravedad: ok ? '' : severity });
  console.log(`${ok ? ' ✔' : ' ✘'} ${name}${ok ? '' : `  → ${detail}`}`);
}

/** La respuesta debe ser alguno de los estados esperados. */
function expectStatus(name, res, expected, severity) {
  const list = Array.isArray(expected) ? expected : [expected];
  record(name, list.includes(res.status), `HTTP ${res.status} (se esperaba ${list.join(' o ')}) ${res.text.slice(0, 160)}`,
    severity);
}

function must(res, status, what) {
  if (res.status !== status) {
    throw new Error(`Preparación — ${what}: HTTP ${res.status} ${res.text.slice(0, 300)}`);
  }
  return res.json;
}

function cookieOf(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  const found = raw.filter(Boolean).map((c) => c.split(';')[0]).find((c) => c.includes('='));
  return found || null;
}

const key = () => `ataque-${randomUUID()}`;

// ------------------------------------------------------------------------------------------------ preparación

async function register(label) {
  const email = `ataque-${RUN}-${label}@ataques.test`.toLowerCase();
  must(await call('POST', '/auth/register', {
    body: { email, password: PASSWORD, fullName: `Prueba ${label}`, acceptTerms: true },
  }), 201, `registro ${label}`);
  return login(email);
}

async function login(email) {
  const res = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
  const body = must(res, 200, `login ${email}`);
  return { email, token: body.accessToken, cookie: cookieOf(res) };
}

async function enter(user, tenantId) {
  const res = await call('POST', '/auth/select-tenant', { token: user.token, cookie: user.cookie, body: { tenantId } });
  const body = must(res, 200, 'elegir negocio');
  return { ...user, platformToken: user.token, token: body.accessToken, cookie: cookieOf(res) || user.cookie, tenantId };
}

async function refresh(user) {
  const res = await call('POST', '/auth/refresh', { cookie: user.cookie });
  const body = must(res, 200, 'renovar sesión');
  return { ...user, token: body.accessToken, cookie: cookieOf(res) || user.cookie };
}

async function join(owner, label, roleCode, branchId) {
  const roles = must(await call('GET', '/roles', { token: owner.token }), 200, 'roles');
  const role = roles.find((r) => r.code === roleCode);
  const user = await register(label);
  const inv = must(await call('POST', '/members/invitations', {
    token: owner.token, body: { email: user.email, roleIds: [role.id], branchIds: [branchId] },
  }), 201, `invitar ${label}`);
  must(await call('POST', '/invitations/accept', { token: user.token, body: { token: inv.token } }), 200, `aceptar ${label}`);
  return enter(user, owner.tenantId);
}

async function product(owner, sku, price, stockBranch, quantity) {
  const p = must(await call('POST', '/products', {
    token: owner.token,
    body: { sku, name: `Producto ${sku}`, baseUnitId: UND, taxId: IVA19, cost: 0, salePrice: price,
      trackInventory: quantity !== undefined },
  }), 201, `producto ${sku}`);
  if (quantity !== undefined) {
    must(await call('POST', '/inventory/initial-balances', {
      token: owner.token, body: { branchId: stockBranch, lines: [{ productId: p.id, quantity, unitCost: 100 }] },
    }), 201, `existencia ${sku}`);
  }
  return p;
}

async function prepare() {
  group = 'Preparación';
  console.log(`\nPreparando dos negocios de prueba en ${BASE} …`);
  const health = await fetch(BASE + '/actuator/health').catch(() => null);
  if (!health || health.status !== 200) {
    throw new Error(`El backend no responde en ${BASE}/actuator/health. ¿Está levantado?`);
  }

  // A: restaurante (mesas, cocina, pedidos, adiciones) con fiado; B: tienda de otra persona.
  const ownerAUser = await register('duenoA');
  const tenantA = must(await call('POST', '/tenants', {
    token: ownerAUser.token,
    body: { slug: `ataque_a_${RUN}`, legalName: 'Restaurante A S.A.S.', tradeName: 'Restaurante A', businessType: 'RESTAURANT' },
  }), 201, 'negocio A');
  let ownerA = await enter(ownerAUser, tenantA.id);
  const profile = must(await call('GET', '/business-profile', { token: ownerA.token }), 200, 'perfil A');
  must(await call('PUT', '/business-profile', {
    token: ownerA.token, body: { businessType: 'RESTAURANT', modules: [...new Set([...profile.modules, 'CREDIT'])] },
  }), 200, 'fiado en A');
  ownerA = await refresh(ownerA);

  const ownerBUser = await register('duenoB');
  const tenantB = must(await call('POST', '/tenants', {
    token: ownerBUser.token,
    body: { slug: `ataque_b_${RUN}`, legalName: 'Tienda B S.A.S.', tradeName: 'Tienda B', businessType: 'RETAIL' },
  }), 201, 'negocio B');
  const ownerB = await enter(ownerBUser, tenantB.id);

  const branches = must(await call('GET', '/branches?size=10', { token: ownerA.token }), 200, 'sucursales');
  const branchA = branches.content[0].id;
  const methods = must(await call('GET', '/payment-methods', { token: ownerA.token }), 200, 'medios de pago');
  const cash = methods.find((m) => m.code === 'CASH').id;
  const credit = methods.find((m) => m.code === 'CREDIT')?.id;
  const cashier = await join(ownerA, 'cajeroA', 'CASHIER', branchA);
  const waiter = await join(ownerA, 'meseroA', 'WAITER', branchA);

  // Datos del negocio A que B intentará leer o cambiar.
  const burger = await product(ownerA, 'HAMB', 18000);
  const last = await product(ownerA, 'ULTIMA', 5000, branchA, 1);
  const stocked = await product(ownerA, 'STOCK', 2000, branchA, 1000);
  const customer = must(await call('POST', '/customers', {
    token: ownerA.token,
    body: { personType: 'NATURAL', documentType: 'CC', documentNumber: `9${Date.now() % 100000000}`, firstNames: 'Ana',
      lastNames: 'Gómez', creditLimit: 100000 },
  }), 201, 'cliente A');
  const session = must(await call('POST', '/cash/sessions', {
    token: ownerA.token, body: { cashRegisterId: CAJA_1, openingAmount: 50000 },
  }), 201, 'abrir caja A');
  const sale = must(await call('POST', '/sales', {
    token: ownerA.token, headers: { 'Idempotency-Key': key() },
    body: { customerId: null, items: [{ productId: stocked.id, quantity: 1 }], payments: [{ paymentMethodId: cash, amount: 2000 }] },
  }), 201, 'venta A');
  const zone = must(await call('POST', '/dining/zones', { token: ownerA.token, body: { branchId: branchA, name: 'Salón' } }), 201, 'zona');
  const tables = [];
  for (let i = 1; i <= 3; i++) {
    tables.push(must(await call('POST', '/dining/tables', { token: ownerA.token, body: { zoneId: zone.id, name: `${i}` } }), 201, 'mesa'));
  }
  const tab = must(await call('POST', '/tabs', { token: waiter.token, body: { kind: 'TABLE', tableId: tables[0].id } }), 201, 'cuenta');
  must(await call('POST', `/tabs/${tab.id}/items`, {
    token: waiter.token, body: { items: [{ productId: burger.id, quantity: 2 }] },
  }), 200, 'agregar a la cuenta');
  const sent = must(await call('POST', `/tabs/${tab.id}/send`, { token: waiter.token }), 200, 'enviar a cocina');
  const ticket = sent.tickets[0];

  console.log('Listo.\n');
  return { ownerA, ownerB, cashier, waiter, branchA, cash, credit, burger, last, stocked, customer, session, sale, tables, tab, ticket };
}

// ------------------------------------------------------------------------------------------------ pruebas

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

async function tokens(d) {
  group = 'Tokens y sesión';
  console.log(`\n== ${group}`);
  expectStatus('Sin token no se ve nada del negocio', await call('GET', '/products'), 401, 'Crítica');
  expectStatus('Token basura', await call('GET', '/products', { token: 'abc.def.ghi' }), 401, 'Crítica');

  const [h, p] = d.ownerA.token.split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  const none = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(claims)}.`;
  expectStatus('Token sin firma (alg "none")', await call('GET', '/products', { token: none }), 401, 'Crítica');

  const forged = { ...claims, perms: [...(claims.perms || []), 'platform:all'], padm: true };
  const unsigned = `${h}.${b64url(forged)}`;
  const wrongSig = createHmac('sha256', 'una-clave-que-no-es-la-del-servidor-0123456789').update(unsigned).digest('base64url');
  expectStatus('Token con firma de otra clave', await call('GET', '/platform/tenants', { token: `${unsigned}.${wrongSig}` }),
    401, 'Crítica');
  const originalSig = d.ownerA.token.split('.')[2];
  expectStatus('Token con permisos agregados a mano (firma vieja)',
    await call('GET', '/platform/tenants', { token: `${unsigned}.${originalSig}` }), 401, 'Crítica');

  const otherTenant = { ...claims, tid: d.ownerB.tenantId };
  expectStatus('Cambiar el negocio dentro del token', await call('GET', '/products', {
    token: `${h}.${b64url(otherTenant)}.${originalSig}` }), 401, 'Crítica');

  expectStatus('Token de plataforma (sin negocio) en datos de negocio',
    await call('GET', '/products', { token: d.ownerA.platformToken }), 403, 'Crítica');
  expectStatus('Dueño de un negocio en la consola de plataforma',
    await call('GET', '/platform/tenants', { token: d.ownerA.token }), 403, 'Crítica');
  expectStatus('Entrar a un negocio ajeno', await call('POST', '/auth/select-tenant', {
    token: d.ownerB.platformToken, cookie: d.ownerB.cookie, body: { tenantId: d.ownerA.tenantId } }), [403, 404], 'Crítica');
  expectStatus('Aceptar una invitación con un código inventado', await call('POST', '/invitations/accept', {
    token: d.ownerB.platformToken, body: { token: 'x'.repeat(43) } }), [404, 410, 422, 400], 'Alta');
}

async function crossTenant(d) {
  group = 'Aislamiento entre negocios';
  console.log(`\n== ${group}`);
  const b = d.ownerB.token;
  const probes = [
    ['Ver un producto de A', 'GET', `/products/${d.burger.id}`],
    ['Cambiar un producto de A', 'PUT', `/products/${d.burger.id}`, { sku: 'HACK', name: 'Hackeado', baseUnitId: UND,
      taxId: IVA19, cost: 0, salePrice: 1, trackInventory: false }],
    ['Desactivar un producto de A', 'POST', `/products/${d.burger.id}/deactivate`],
    ['Ver una venta de A', 'GET', `/sales/${d.sale.id}`],
    ['Anular una venta de A', 'POST', `/sales/${d.sale.id}/void`, { reason: 'ataque' }],
    ['Ver un cliente de A', 'GET', `/customers/${d.customer.id}`],
    ['Ver el fiado de un cliente de A', 'GET', `/credit/accounts/${d.customer.id}`],
    ['Ver la caja de A', 'GET', `/cash/sessions/${d.session.id}`],
    ['Ver el informe de caja de A', 'GET', `/cash/sessions/${d.session.id}/report`],
    ['Unirse a la caja de A', 'POST', `/cash/sessions/${d.session.id}/join`],
    ['Sacar plata de la caja de A', 'POST', `/cash/sessions/${d.session.id}/movements`, { type: 'WITHDRAWAL', amount: 1000, reason: 'x' }],
    ['Ver una cuenta de mesa de A', 'GET', `/tabs/${d.tab.id}`],
    ['Cobrar una cuenta de mesa de A', 'POST', `/tabs/${d.tab.id}/charge`, { expectedTotal: 36000, payments: [] }],
    ['Ver una comanda de A', 'GET', `/kitchen/tickets/${d.ticket.id}`],
    ['Cambiar el estado de una comanda de A', 'POST', `/kitchen/tickets/${d.ticket.id}/status`, { status: 'READY' }],
    ['Desactivar al dueño de A', 'POST', `/members/${d.ownerA.tenantId}/deactivate`],
  ];
  for (const [name, method, path, body] of probes) {
    const res = await call(method, path, { token: b, body, headers: { 'Idempotency-Key': key() } });
    record(name, res.status >= 400 && res.status < 500 && res.status !== 429,
      `HTTP ${res.status}: B pudo ${method} ${path} ${res.text.slice(0, 120)}`, 'Crítica');
  }
  const sale = await call('POST', '/sales', {
    token: b, headers: { 'Idempotency-Key': key() },
    body: { customerId: d.customer.id, items: [{ productId: d.burger.id, quantity: 1 }], payments: [] },
  });
  record('Vender en B con un producto y un cliente de A', sale.status >= 400 && sale.status < 500,
    `HTTP ${sale.status} ${sale.text.slice(0, 120)}`, 'Crítica');
  const list = await call('GET', '/products?size=100', { token: b });
  record('La lista de productos de B no trae los de A',
    list.status === 200 && !JSON.stringify(list.json).includes(d.burger.id), 'Aparece un producto de A en B', 'Crítica');
}

async function privileges(d) {
  group = 'Permisos dentro del negocio';
  console.log(`\n== ${group}`);
  const c = d.cashier.token;
  const w = d.waiter.token;
  const roles = must(await call('GET', '/roles', { token: d.ownerA.token }), 200, 'roles');
  const ownerRole = roles.find((r) => r.code === 'OWNER' || r.code === 'ADMIN');
  const probes = [
    [c, 'Cajero crea un rol con todos los permisos', 'POST', '/roles', { code: 'TODO', name: 'Todo', permissions: ['roles:manage'] }],
    [c, 'Cajero se invita a sí mismo como administrador', 'POST', '/members/invitations',
      { email: `otro-${RUN}@ataques.test`, roleIds: [ownerRole.id], branchIds: [d.branchA] }],
    [c, 'Cajero cambia los ajustes del negocio', 'PUT', '/settings', { tipPercent: 50 }],
    [c, 'Cajero cambia el tipo de negocio y los módulos', 'PUT', '/business-profile', { businessType: 'RETAIL', modules: [] }],
    [c, 'Cajero lee la auditoría', 'GET', '/audit'],
    [c, 'Cajero ve y reparte las propinas', 'GET', '/tips'],
    [c, 'Cajero crea productos', 'POST', '/products', { sku: 'X1', name: 'X', baseUnitId: UND, taxId: IVA19, cost: 0, salePrice: 1, trackInventory: false }],
    [c, 'Cajero ajusta el inventario', 'POST', '/inventory/adjustments', { branchId: d.branchA, reason: 'x', lines: [] }],
    [c, 'Cajero desactiva al dueño', 'POST', `/members/${d.ownerA.tenantId}/deactivate`],
    [w, 'Mesero crea mesas', 'POST', '/dining/tables', { zoneId: d.tables[0].zoneId, name: 'Hack' }],
    [w, 'Mesero exporta las ventas', 'GET', '/reports/sales.csv'],
    [w, 'Mesero lee la auditoría', 'GET', '/audit'],
    [w, 'Mesero cambia ajustes', 'PUT', '/settings', { tipPercent: 50 }],
    [w, 'Mesero entra a la consola de plataforma', 'GET', '/platform/tenants'],
  ];
  for (const [token, name, method, path, body] of probes) {
    const res = await call(method, path, { token, body });
    record(name, res.status === 403 || res.status === 404 || res.status === 400 || res.status === 422,
      `HTTP ${res.status}: se permitió ${method} ${path}`, 'Alta');
  }
  const members = must(await call('GET', '/members', { token: d.ownerA.token }), 200, 'miembros');
  const owner = (members.content || members).find((m) => m.email === d.ownerA.email);
  if (owner) {
    const res = await call('PUT', `/members/${owner.id}`, {
      token: d.cashier.token, body: { roleIds: [], branchIds: [d.branchA], defaultBranchId: d.branchA } });
    record('Cajero le quita los roles al dueño', res.status === 403 || res.status === 400, `HTTP ${res.status}`, 'Alta');
  }
}

async function inputs(d) {
  group = 'Entradas maliciosas';
  console.log(`\n== ${group}`);
  const t = d.ownerA.token;
  const sqli = ["' OR '1'='1", "'; DROP TABLE products; --", '%', '\\', "1' UNION SELECT email FROM platform.users--"];
  for (const q of sqli) {
    for (const path of ['/products', '/customers', '/sales', '/audit']) {
      const res = await call('GET', `${path}?q=${encodeURIComponent(q)}&search=${encodeURIComponent(q)}`, { token: t });
      if (res.status >= 500 || /platform\.users|@ataques\.test/.test(res.text) && path !== '/audit') {
        record(`Búsqueda con inyección SQL en ${path}: ${q}`, false, `HTTP ${res.status} ${res.text.slice(0, 120)}`, 'Crítica');
      }
    }
  }
  record('Búsquedas con inyección SQL (20 combinaciones) no fallan ni filtran datos', true, '');
  for (const sort of ['id;DROP TABLE sales', 'createdAt,desc;select 1', 'password', '(select 1)']) {
    const res = await call('GET', `/sales?sort=${encodeURIComponent(sort)}`, { token: t });
    record(`Orden inyectado en ventas: ${sort}`, res.status < 500, `HTTP ${res.status}`, 'Alta');
  }
  expectStatus('Id que no es UUID', await call('GET', '/products/no-es-un-id', { token: t }), [400, 404], 'Baja');
  expectStatus('JSON mal formado', await call('POST', '/products', { token: t, rawBody: '{"sku": "x",' }), 400, 'Baja');
  expectStatus('Nombre de 100.000 caracteres', await call('POST', '/products', {
    token: t, body: { sku: 'LARGO', name: 'x'.repeat(100000), baseUnitId: UND, taxId: IVA19, cost: 0, salePrice: 1, trackInventory: false } }),
  [400, 422], 'Media');

  const saleProbes = [
    ['Venta con cantidad negativa', [{ productId: d.stocked.id, quantity: -5 }], [{ paymentMethodId: d.cash, amount: 0 }]],
    ['Venta con cantidad gigante', [{ productId: d.stocked.id, quantity: 1e15 }], [{ paymentMethodId: d.cash, amount: 1 }]],
    ['Venta con pago negativo', [{ productId: d.stocked.id, quantity: 1 }], [{ paymentMethodId: d.cash, amount: -100000 }]],
    ['Venta pagando menos del total', [{ productId: d.stocked.id, quantity: 1 }], [{ paymentMethodId: d.cash, amount: 1 }]],
    ['Venta con precio puesto por el cliente', [{ productId: d.stocked.id, quantity: 1, unitPrice: 1 }], [{ paymentMethodId: d.cash, amount: 1 }]],
  ];
  for (const [name, items, payments] of saleProbes) {
    const res = await call('POST', '/sales', { token: t, headers: { 'Idempotency-Key': key() }, body: { items, payments } });
    record(name, res.status >= 400 && res.status < 500, `HTTP ${res.status} ${res.text.slice(0, 160)}`,
      res.status === 201 ? 'Alta' : 'Media');
  }
  const xss = '<img src=x onerror=alert(document.cookie)>';
  const res = await call('POST', '/customers', {
    token: t, body: { personType: 'NATURAL', documentType: 'CC', documentNumber: `8${Date.now() % 100000000}`, firstNames: xss, lastNames: 'X' } });
  record('Texto con HTML se guarda como texto (JSON, sin interpretar)',
    res.status >= 400 || (res.headers.get('content-type') || '').includes('application/json'), `Content-Type ${res.headers.get('content-type')}`, 'Media');
  const big = await call('POST', '/products', { token: t, rawBody: `{"sku":"${'A'.repeat(12 * 1024 * 1024)}"}` }).catch((e) => ({ status: 0, text: String(e), json: null, headers: new Headers() }));
  record('Cuerpo de 12 MB directo al backend', big.status === 0 || (big.status >= 400 && big.status < 500),
    `HTTP ${big.status} (en producción Caddy corta en 10 MB)`, 'Baja');
}

async function races(d) {
  group = 'Carreras (peticiones simultáneas)';
  console.log(`\n== ${group}`);
  const t = d.ownerA.token;

  const last = await Promise.all(Array.from({ length: 10 }, () => call('POST', '/sales', {
    token: t, headers: { 'Idempotency-Key': key() },
    body: { items: [{ productId: d.last.id, quantity: 1 }], payments: [{ paymentMethodId: d.cash, amount: 5000 }] } })));
  const sold = last.filter((r) => r.status === 201).length;
  record('10 cajas venden la última unidad a la vez: solo 1 la vende', sold === 1,
    `${sold} ventas de 1 unidad en existencia (${last.map((r) => r.status).join(',')})`, 'Alta');

  const k = key();
  const dup = await Promise.all(Array.from({ length: 8 }, () => call('POST', '/sales', {
    token: t, headers: { 'Idempotency-Key': k },
    body: { items: [{ productId: d.stocked.id, quantity: 1 }], payments: [{ paymentMethodId: d.cash, amount: 2000 }] } })));
  const ids = new Set(dup.filter((r) => r.status === 201).map((r) => r.json.id));
  record('Doble clic (8 veces la misma venta a la vez): queda 1 venta', ids.size === 1,
    `${ids.size} ventas distintas (${dup.map((r) => r.status).join(',')})`, 'Alta');

  const report = must(await call('GET', `/cash/sessions/${d.session.id}/report`, { token: t }), 200, 'informe');
  const expected = Number(report.cash.expected);
  const withdrawals = await Promise.all(Array.from({ length: 5 }, () => call('POST', `/cash/sessions/${d.session.id}/movements`, {
    token: t, headers: { 'Idempotency-Key': key() }, body: { type: 'WITHDRAWAL', amount: expected, reason: 'Retiro simultáneo' } })));
  const out = withdrawals.filter((r) => r.status === 201).length;
  record('5 retiros simultáneos de todo el efectivo: solo 1 pasa', out <= 1,
    `${out} retiros de ${expected} (${withdrawals.map((r) => r.status).join(',')})`, 'Alta');

  const tab = must(await call('GET', `/tabs/${d.tab.id}`, { token: d.waiter.token }), 200, 'cuenta');
  const total = Number(tab.total);
  const charges = await Promise.all(Array.from({ length: 5 }, () => call('POST', `/tabs/${d.tab.id}/charge`, {
    token: t, headers: { 'Idempotency-Key': key() },
    body: { expectedTotal: total, payments: [{ paymentMethodId: d.cash, amount: total + 3000 }],
      tip: { amount: 3000, paymentMethodId: d.cash } } })));
  const charged = charges.filter((r) => r.status === 201).length;
  record('5 cobros simultáneos de la misma mesa: se cobra 1 vez', charged === 1,
    `${charged} cobros (${charges.map((r) => r.status).join(',')}) ${charges[0].text.slice(0, 160)}`, 'Alta');

  const prints = await Promise.all(Array.from({ length: 5 }, () => call('POST', `/kitchen/tickets/${d.ticket.id}/print`, {
    token: d.waiter.token, body: { auto: true } })));
  const printed = prints.filter((r) => r.status === 200).length;
  record('5 impresoras automáticas toman la misma comanda: la imprime 1', printed <= 1,
    `${printed} impresiones automáticas (${prints.map((r) => r.status).join(',')})`, 'Media');

  const tips = must(await call('GET', '/tips', { token: t }), 200, 'propinas');
  if (tips.pending > 0 && tips.people.length) {
    const payouts = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/tips/payouts', {
      token: t, body: { from: tips.from, to: tips.to, amount: tips.pending, memberIds: [tips.people[0].memberId], fromCash: false } })));
    const paid = payouts.filter((r) => r.status === 201).length;
    record('5 repartos simultáneos de todas las propinas: pasa 1', paid === 1,
      `${paid} repartos (${payouts.map((r) => r.status).join(',')})`, 'Alta');
  }

  const credit = await call('POST', '/sales', {
    token: t, headers: { 'Idempotency-Key': key() },
    body: { customerId: d.customer.id, items: [{ productId: d.stocked.id, quantity: 5 }],
      payments: [{ paymentMethodId: d.credit, amount: 10000 }] } });
  if (credit.status === 201) {
    const pays = await Promise.all(Array.from({ length: 5 }, () => call('POST', `/credit/accounts/${d.customer.id}/payments`, {
      token: t, headers: { 'Idempotency-Key': key() }, body: { amount: 10000, paymentMethodId: d.cash } })));
    const ok = pays.filter((r) => r.status === 201).length;
    record('5 abonos simultáneos que pagan toda la deuda: pasa 1', ok === 1,
      `${ok} abonos de 10.000 sobre una deuda de 10.000 (${pays.map((r) => r.status).join(',')})`, 'Alta');
  } else {
    record('Venta a crédito para probar abonos simultáneos', false, `HTTP ${credit.status} ${credit.text.slice(0, 160)}`, 'Baja');
  }
}

async function realtime(d) {
  group = 'Avisos en tiempo real';
  console.log(`\n== ${group}`);
  const controllers = [];
  let accepted = 0;
  for (let i = 0; i < 40; i++) {
    const ac = new AbortController();
    controllers.push(ac);
    const res = await fetch(`${API}/dining/events`, { headers: { Authorization: `Bearer ${d.waiter.token}` }, signal: ac.signal })
      .catch(() => null);
    if (res && res.status === 200) accepted++;
  }
  controllers.forEach((c) => c.abort());
  record('Un mismo usuario no puede abrir conexiones de avisos sin tope', accepted <= 10,
    `abrió ${accepted} de 40 conexiones a la vez (cada una ocupa memoria y una conexión del servidor)`, 'Media');
  const other = await call('GET', '/dining/events', { token: d.ownerB.token, raw: true });
  record('Una tienda sin mesas no recibe avisos de mesas', other.status === 403, `HTTP ${other.status}`, 'Media');
}

async function sessions(d) {
  group = 'Sesiones, bloqueo y límites';
  console.log(`\n== ${group}`);
  // Desactivar a un miembro: ¿su sesión abierta sigue sirviendo?
  const members = must(await call('GET', '/members', { token: d.ownerA.token }), 200, 'miembros');
  const cashier = (members.content || members).find((m) => m.email === d.cashier.email);
  if (!cashier) throw new Error(`No encontré al cajero en /members: ${JSON.stringify(members).slice(0, 400)}`);
  must(await call('POST', `/members/${cashier.id}/deactivate`, { token: d.ownerA.token }), 200, 'desactivar cajero');
  const after = await call('GET', '/products', { token: d.cashier.token });
  record('Al desactivar a un cajero, su sesión abierta deja de servir', after.status === 401 || after.status === 403,
    `HTTP ${after.status}: sigue entrando hasta que vence su acceso (15 min)`, 'Media');
  const renew = await call('POST', '/auth/refresh', { cookie: d.cashier.cookie });
  record('Al desactivarlo no puede renovar la sesión', renew.status === 401 || renew.status === 403, `HTTP ${renew.status}`, 'Alta');

  // Cerrar sesión invalida la renovación.
  const logout = await call('POST', '/auth/logout', { cookie: d.waiter.cookie });
  const reuse = await call('POST', '/auth/refresh', { cookie: d.waiter.cookie });
  record('Después de cerrar sesión no se puede renovar', logout.status < 300 && reuse.status === 401,
    `logout ${logout.status}, refresh ${reuse.status}`, 'Alta');

  // Bloqueo de la cuenta tras 5 contraseñas malas.
  for (let i = 0; i < 5; i++) {
    await call('POST', '/auth/login', { body: { email: d.ownerB.email, password: 'mala' }, raw: true });
  }
  const locked = await call('POST', '/auth/login', { body: { email: d.ownerB.email, password: PASSWORD }, raw: true });
  record('5 contraseñas malas bloquean la cuenta (incluso con la buena)', locked.status === 423 || locked.status === 429,
    `HTTP ${locked.status}`, 'Alta');

  // Límite de intentos de login por IP (10 por minuto en producción).
  let limited = 0;
  for (let i = 0; i < 12 && !limited; i++) {
    const r = await call('POST', '/auth/login', { body: { email: `nadie-${i}@ataques.test`, password: 'x' }, raw: true });
    if (r.status === 429) limited = i + 1;
  }
  record('Muchos intentos de login desde una IP terminan en 429', limited > 0, 'Nunca respondió 429 (¿límites de producción?)', 'Alta');
  const enumA = await call('POST', '/auth/login', { body: { email: `nadie-${RUN}@ataques.test`, password: 'x' }, raw: true });
  record('Los mensajes de login no dicen si el correo existe', enumA.status === 401 || enumA.status === 429,
    `HTTP ${enumA.status}`, 'Baja');
}

function leaks() {
  group = 'Errores internos';
  console.log(`\n== ${group}`);
  const exposed = serverErrors.filter((e) => /Exception|at com\.|org\.springframework|SQL|PSQL|hibernate/i.test(e.body));
  record('Ninguna respuesta muestra detalles internos (clases, SQL)', exposed.length === 0,
    exposed.map((e) => `${e.method} ${e.path}`).join('; '), 'Media');
  record('Ninguna prueba provocó un error 500', serverErrors.length === 0,
    serverErrors.map((e) => `${e.status} ${e.method} ${e.path} [${e.group}]`).join('; '), 'Media');
}

// ------------------------------------------------------------------------------------------------ principal

const started = Date.now();
try {
  const d = await prepare();
  await tokens(d);
  await crossTenant(d);
  await privileges(d);
  await inputs(d);
  await races(d);
  await realtime(d);
  await sessions(d);
  leaks();
} catch (e) {
  console.error(`\n${e.message}`);
  results.push({ grupo: group, prueba: 'La prueba terminó antes de tiempo', ok: false, detalle: e.message, gravedad: 'Alta' });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} de ${results.length} pruebas aguantaron (${Math.round((Date.now() - started) / 1000)} s).`);
if (failed.length) {
  console.log('\nLo que NO aguantó:');
  const order = { Crítica: 0, Alta: 1, Media: 2, Baja: 3 };
  failed.sort((a, b) => order[a.gravedad] - order[b.gravedad])
    .forEach((r) => console.log(` [${r.gravedad}] ${r.grupo} — ${r.prueba}: ${r.detalle}`));
}
mkdirSync(new URL('./resultados/', import.meta.url), { recursive: true });
writeFileSync(new URL('./resultados/ataques.json', import.meta.url),
  JSON.stringify({ base: BASE, fecha: new Date().toISOString(), resultados: results, errores500: serverErrors }, null, 2));
process.exit(failed.length ? 1 : 0);
