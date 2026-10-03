// Crea un negocio de demostración que usa, de forma básica, todas las funciones de las fases 1 a 5.
//
// Uso (con la app levantada por docker compose):
//   node tools/demo/seed-demo.mjs
// Variables opcionales:
//   POS_API        URL del backend (por defecto http://localhost:8080)
//   DEMO_SLUG      identificador del negocio (por defecto tienda_demo)
//   DEMO_PASSWORD  contraseña de los usuarios demo (por defecto DemoPos2026)
//
// Solo usa la API pública (no toca la base de datos). Requiere Node 18 o superior.

import { randomUUID } from 'node:crypto';

const BASE = (process.env.POS_API ?? 'http://localhost:8080').replace(/\/$/, '');
const SLUG = process.env.DEMO_SLUG ?? 'tienda_demo';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'DemoPos2026';
const DOMAIN = 'tienda-demo.test';

// IDs sembrados en todo negocio nuevo (db/tenant V2, V5 y V7)
const ID = {
  PRINCIPAL: '01920000-0000-7000-8000-000000000101',
  CAJA_1: '01920000-0000-7000-8000-000000000201',
  UND: '01920000-0000-7000-8000-000000000301',
  KG: '01920000-0000-7000-8000-000000000302',
  CJ: '01920000-0000-7000-8000-000000000308',
  PAQ: '01920000-0000-7000-8000-000000000309',
  IVA19: '01920000-0000-7000-8000-000000000401',
  IVA5: '01920000-0000-7000-8000-000000000402',
  EXCLUIDO: '01920000-0000-7000-8000-000000000404',
  CASH: '01920000-0000-7000-8000-000000000701',
  CARD: '01920000-0000-7000-8000-000000000702',
  TRANSFER: '01920000-0000-7000-8000-000000000703',
};

const USERS = {
  owner: { email: `dueno@${DOMAIN}`, fullName: 'Daniela Dueña (demo)' },
  cashier: { email: `cajero@${DOMAIN}`, fullName: 'Carlos Cajero (demo)', role: 'CASHIER' },
  seller: { email: `vendedor@${DOMAIN}`, fullName: 'Valentina Vendedora (demo)', role: 'SELLER' },
  warehouse: { email: `bodega@${DOMAIN}`, fullName: 'Bernardo Bodega (demo)', role: 'WAREHOUSE' },
};

// ---------------------------------------------------------------- HTTP

class ApiError extends Error {
  constructor(status, problem, method, path) {
    super(`${method} ${path} → ${status}: ${problem?.detail ?? problem?.title ?? 'sin detalle'}`);
    this.status = status;
    this.problem = problem;
  }
}

async function api(method, path, { token, body, headers = {}, expect } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok && !(expect ?? []).includes(response.status)) {
    throw new ApiError(response.status, data, method, path);
  }
  return { status: response.status, data };
}

const idem = (prefix) => ({ 'Idempotency-Key': `${prefix}-${randomUUID()}` });

function step(text) {
  console.log(`• ${text}`);
}

/** Dígito de verificación del NIT (algoritmo DIAN). */
function nitDv(nit) {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digits = String(nit).split('').reverse().map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
  const r = sum % 11;
  return r > 1 ? 11 - r : r;
}

// ---------------------------------------------------------------- usuarios y sesión

async function ensureUser(user) {
  await api('POST', '/api/v1/auth/register', {
    body: { email: user.email, password: PASSWORD, fullName: user.fullName },
    expect: [409],
  });
  const { data } = await api('POST', '/api/v1/auth/login', { body: { email: user.email, password: PASSWORD } });
  return data.accessToken;
}

async function selectTenant(platformToken, tenantId) {
  const { data } = await api('POST', '/api/v1/auth/select-tenant', { token: platformToken, body: { tenantId } });
  return data.accessToken;
}

// ---------------------------------------------------------------- guion

async function main() {
  console.log(`Creando el negocio de demostración en ${BASE} …\n`);

  // Fase 1: dueño y negocio
  const ownerPlatform = await ensureUser(USERS.owner);
  const { data: mine } = await api('GET', '/api/v1/tenants', { token: ownerPlatform });
  if (mine.some((t) => t.slug === SLUG)) {
    console.log(`El negocio "${SLUG}" ya existe. Entra con ${USERS.owner.email} / ${PASSWORD}.`);
    console.log('Para crear otro, ejecuta de nuevo con DEMO_SLUG=otro_nombre.');
    return;
  }
  const { data: tenant } = await api('POST', '/api/v1/tenants', {
    token: ownerPlatform,
    body: { slug: SLUG, legalName: 'Tienda Demo S.A.S.', tradeName: 'Tienda Demo', businessType: 'RETAIL' },
  });
  const owner = await selectTenant(ownerPlatform, tenant.id);
  step('Dueño y negocio "Tienda Demo" creados');

  // Fase 2: ajustes, sucursales y cajas
  await api('PUT', '/api/v1/settings', {
    token: owner,
    body: {
      allowNegativeStock: false, pricesIncludeTax: true, timezone: 'America/Bogota', currency: 'COP',
      receiptFooter: '¡Gracias por su compra! Tienda Demo', maxDiscountPercent: 5,
    },
  });
  await api('PUT', `/api/v1/branches/${ID.PRINCIPAL}`, {
    token: owner,
    body: { name: 'Sede Centro', address: 'Calle 10 # 5-20', cityCode: '11001', phone: '6015550100' },
  });
  const { data: north } = await api('POST', '/api/v1/branches', {
    token: owner,
    body: { code: 'NORTE', name: 'Sede Norte', address: 'Carrera 15 # 120-30', cityCode: '11001', phone: '6015550200' },
  });
  const { data: quickRegister } = await api('POST', '/api/v1/cash-registers', {
    token: owner, body: { branchId: ID.PRINCIPAL, code: 'CAJA-2', name: 'Caja rápida' },
  });
  await api('POST', '/api/v1/cash-registers', {
    token: owner, body: { branchId: north.id, code: 'CAJA-N1', name: 'Caja Norte' },
  });
  step('Ajustes, sucursal Norte y cajas CAJA-2 y CAJA-N1');

  // Fase 2: usuarios invitados (cajero, vendedor y bodeguero)
  const { data: roles } = await api('GET', '/api/v1/roles', { token: owner });
  const roleId = (code) => roles.find((r) => r.code === code).id;
  const tokens = {};
  for (const key of ['cashier', 'seller', 'warehouse']) {
    const user = USERS[key];
    const branchIds = key === 'warehouse' ? [ID.PRINCIPAL, north.id] : [ID.PRINCIPAL];
    const { data: invitation } = await api('POST', '/api/v1/members/invitations', {
      token: owner, body: { email: user.email, roleIds: [roleId(user.role)], branchIds },
    });
    const platform = await ensureUser(user);
    await api('POST', '/api/v1/invitations/accept', { token: platform, body: { token: invitation.token } });
    tokens[key] = await selectTenant(await ensureUser(user), tenant.id);
  }
  step('Usuarios cajero, vendedor y bodeguero (invitados y aceptados)');

  // Fase 3: catálogo
  const category = async (name, parentId = null) =>
    (await api('POST', '/api/v1/categories', { token: owner, body: { name, parentId } })).data.id;
  const drinks = await category('Bebidas');
  const sodas = await category('Gaseosas', drinks);
  const waters = await category('Aguas', drinks);
  const snacks = await category('Snacks');
  const groceries = await category('Granos');
  const cleaning = await category('Aseo');
  const services = await category('Servicios');
  const { data: wholesale } = await api('POST', '/api/v1/price-lists', {
    token: owner, body: { code: 'MAYORISTA', name: 'Mayorista' },
  });

  const internalCode = async () => (await api('POST', '/api/v1/barcodes/internal', { token: owner })).data.barcode;
  /** Crea el producto con un código interno por cada unidad indicada (null = unidad base). */
  const product = async (body, codeUnits = [null]) => {
    const full = { description: null, cost: 0, trackInventory: true, conversions: [], listPrices: [], ...body };
    const barcodes = [];
    if (codeUnits.length > 0) {
      barcodes.push({ barcode: await internalCode(), unitId: codeUnits[0], internal: true });
    }
    const { data } = await api('POST', '/api/v1/products', { token: owner, body: { ...full, barcodes } });
    // Cada código interno nuevo depende de los ya guardados: los siguientes se agregan uno a uno.
    for (const unitId of codeUnits.slice(1)) {
      barcodes.push({ barcode: await internalCode(), unitId, internal: true });
      await api('PUT', `/api/v1/products/${data.id}`, { token: owner, body: { ...full, barcodes } });
    }
    return data.id;
  };
  const soda = await product({
    sku: 'GAS-350', name: 'Gaseosa cola 350 ml', categoryId: sodas, baseUnitId: ID.UND, taxId: ID.IVA19,
    salePrice: 2500,
    conversions: [{ unitId: ID.CJ, factor: 24, salePrice: 54000 }],
    listPrices: [
      { priceListId: wholesale.id, unitId: null, price: 2200 },
      { priceListId: wholesale.id, unitId: ID.CJ, price: 50000 },
    ],
  }, [null, ID.CJ]);
  const water = await product({
    sku: 'AGUA-600', name: 'Agua sin gas 600 ml', categoryId: waters, baseUnitId: ID.UND, taxId: ID.IVA19,
    salePrice: 1800, conversions: [{ unitId: ID.PAQ, factor: 6, salePrice: null }],
  }, [null]);
  const chips = await product({
    sku: 'PAPAS-45', name: 'Papas fritas 45 g', categoryId: snacks, baseUnitId: ID.UND, taxId: ID.IVA19,
    salePrice: 2200,
  }, [null]);
  const rice = await product({
    sku: 'ARROZ-KG', name: 'Arroz blanco (kg)', categoryId: groceries, baseUnitId: ID.KG, taxId: ID.EXCLUIDO,
    salePrice: 4200,
  }, [null]);
  const soap = await product({
    sku: 'JABON-BAR', name: 'Jabón de barra', categoryId: cleaning, baseUnitId: ID.UND, taxId: ID.IVA19,
    salePrice: 3500,
  }, [null]);
  const coffee = await product({
    sku: 'CAFE-250', name: 'Café molido 250 g', categoryId: groceries, baseUnitId: ID.UND, taxId: ID.IVA5,
    salePrice: 9800,
  }, [null]);
  const delivery = await product({
    sku: 'DOMICILIO', name: 'Domicilio', categoryId: services, baseUnitId: ID.UND, taxId: ID.IVA19,
    salePrice: 3000, trackInventory: false,
  }, []);
  step('Categorías, lista Mayorista y 7 productos (con códigos internos, caja de 24 y paquete de 6)');

  // Fase 3: terceros
  await api('POST', '/api/v1/customers', {
    token: owner,
    body: {
      personType: 'NATURAL', documentType: 'CC', documentNumber: '1020304050', firstNames: 'María',
      lastNames: 'Pérez Gómez', email: 'maria.perez@correo.test', phone: '3001234567', address: 'Calle 45 # 10-11',
      cityCode: '11001', priceListId: null, creditLimit: 0,
    },
  });
  const { data: shop } = await api('POST', '/api/v1/customers', {
    token: owner,
    body: {
      personType: 'LEGAL', documentType: 'NIT', documentNumber: '900123456', verificationDigit: nitDv('900123456'),
      businessName: 'Distribuidora La Esquina S.A.S.', email: 'compras@laesquina.test', phone: '6017654321',
      address: 'Avenida 68 # 22-10', cityCode: '11001', priceListId: wholesale.id, creditLimit: 0,
    },
  });
  await api('POST', '/api/v1/suppliers', {
    token: owner,
    body: {
      personType: 'LEGAL', documentType: 'NIT', documentNumber: '800765432', verificationDigit: nitDv('800765432'),
      businessName: 'Bebidas del Valle S.A.', email: 'ventas@bebidasvalle.test', phone: '6024445566',
      address: 'Calle 5 # 30-40', cityCode: '76001',
    },
  });
  step('Clientes (persona y empresa con lista Mayorista) y un proveedor');

  // Fase 4: inventario
  const line = (productId, quantity, extra = {}) => ({ productId, quantity, ...extra });
  await api('POST', '/api/v1/inventory/initial-balances', {
    token: owner, headers: idem('ini'),
    body: {
      branchId: ID.PRINCIPAL, notes: 'Inventario inicial demo',
      lines: [
        line(soda, 96, { unitCost: 1200 }), line(water, 48, { unitCost: 700 }), line(chips, 60, { unitCost: 1100 }),
        line(rice, 50, { unitCost: 2800 }), line(soap, 30, { unitCost: 1500 }), line(coffee, 20, { unitCost: 6500 }),
      ],
    },
  });
  await api('POST', '/api/v1/inventory/transfers', {
    token: tokens.warehouse, headers: idem('tra'),
    body: {
      fromBranchId: ID.PRINCIPAL, toBranchId: north.id, notes: 'Surtido sede Norte',
      lines: [line(soda, 24), line(water, 12), line(chips, 12)],
    },
  });
  await api('POST', '/api/v1/inventory/adjustments', {
    token: tokens.warehouse, headers: idem('aju'),
    body: {
      branchId: ID.PRINCIPAL, reason: 'Compra de contado y averías',
      lines: [
        { productId: soda, unitId: ID.CJ, quantity: 1, direction: 'IN', unitCost: 30000 },
        { productId: chips, quantity: 2, direction: 'OUT' },
      ],
    },
  });
  await api('POST', '/api/v1/inventory/counts', {
    token: tokens.warehouse, headers: idem('con'),
    body: { branchId: north.id, reason: 'Conteo mensual', lines: [line(water, 11)] },
  });
  await api('PUT', '/api/v1/inventory/stock-levels', {
    token: owner, body: { branchId: ID.PRINCIPAL, productId: soap, minStock: 40, maxStock: 120 },
  });
  await api('PUT', '/api/v1/inventory/stock-levels', {
    token: owner, body: { branchId: ID.PRINCIPAL, productId: chips, minStock: 10, maxStock: 100 },
  });
  step('Saldo inicial, traslado a Norte, ajuste (con costo), conteo físico y mínimos (alerta de jabón)');

  // Fase 5: caja y ventas del dueño
  const { data: ownerSession } = await api('POST', '/api/v1/cash/sessions', {
    token: owner, body: { cashRegisterId: ID.CAJA_1, openingAmount: 100000, notes: 'Apertura demo' },
  });
  const sell = async (token, body) =>
    (await api('POST', '/api/v1/sales', { token, headers: idem('sale'), body })).data;

  await sell(owner, {
    items: [{ productId: soda, quantity: 2 }, { productId: chips, quantity: 1 }],
    payments: [{ paymentMethodId: ID.CASH, amount: 10000 }],
  });
  await sell(owner, {
    customerId: shop.id,
    items: [{ productId: soda, unitId: ID.CJ, quantity: 1 }, { productId: water, unitId: ID.PAQ, quantity: 1 }],
    payments: [
      { paymentMethodId: ID.CARD, amount: 40000, reference: 'APR-1001' },
      { paymentMethodId: ID.TRANSFER, amount: 20800, reference: 'NEQUI-555' },
    ],
  });
  await sell(owner, {
    items: [
      { productId: rice, quantity: 2.5, discountPercent: 5 },
      { productId: coffee, quantity: 1 },
      { productId: delivery, quantity: 1 },
    ],
    payments: [{ paymentMethodId: ID.CASH, amount: 30000 }],
  });
  const toVoid = await sell(owner, {
    items: [{ productId: soap, quantity: 1 }],
    payments: [{ paymentMethodId: ID.CASH, amount: 3500 }],
  });
  await api('POST', `/api/v1/sales/${toVoid.id}/void`, { token: owner, body: { reason: 'Cliente desistió (demo)' } });

  const movement = (type, amount, reason) => api('POST', `/api/v1/cash/sessions/${ownerSession.id}/movements`, {
    token: owner, headers: idem('mov'), body: { type, amount, reason },
  });
  await movement('INCOME', 20000, 'Base adicional');
  await movement('EXPENSE', 8000, 'Pago de domicilio');
  await movement('WITHDRAWAL', 50000, 'Consignación al banco');

  // Cierre del dueño con un faltante de 1.000 para ver el arqueo
  const { data: partial } = await api('GET', `/api/v1/cash/sessions/${ownerSession.id}/report`, { token: owner });
  await api('POST', `/api/v1/cash/sessions/${ownerSession.id}/close`, {
    token: owner, body: { countedAmount: partial.cash.expected - 1000, notes: 'Cierre demo con faltante' },
  });
  step('Caja 1: 4 ventas (efectivo, mixta con tarjeta y transferencia, descuento), 1 anulación, movimientos y cierre');

  // Fase 5: el cajero abre CAJA-2, vende y cierra cuadrado
  const { data: cashierSession } = await api('POST', '/api/v1/cash/sessions', {
    token: tokens.cashier, body: { cashRegisterId: quickRegister.id, openingAmount: 50000 },
  });
  await sell(tokens.cashier, {
    items: [{ productId: soda, quantity: 3 }],
    payments: [{ paymentMethodId: ID.CASH, amount: 10000 }],
  });
  await api('POST', `/api/v1/cash/sessions/${cashierSession.id}/close`, {
    token: tokens.cashier, body: { countedAmount: 57500, notes: 'Cierre del cajero' },
  });
  step('Caja rápida: venta del cajero y cierre cuadrado');

  console.log(`
Listo. Abre http://localhost:4200 y entra con cualquiera de estos usuarios (contraseña: ${PASSWORD}):
  Dueño       ${USERS.owner.email}       todo; ve esperado y diferencias del arqueo
  Cajero      ${USERS.cashier.email}      vende y opera su caja (arqueo ciego)
  Vendedor    ${USERS.seller.email}    ve la pantalla de venta, no opera caja ni anula
  Bodeguero   ${USERS.warehouse.email}      productos e inventario (ajustes y traslados)

Para vender, abre una caja en "Mi caja" (las dos sesiones de la demo quedaron cerradas).
Productos: escribe GAS-350, AGUA-600, PAPAS-45, ARROZ-KG (admite 0,5), JABON-BAR, CAFE-250 o DOMICILIO
en la pantalla de venta, o usa F2 para buscar por nombre.`);
}

main().catch((error) => {
  console.error(`\nNo se pudo completar la demo: ${error.message}`);
  if (error instanceof TypeError && String(error.cause ?? '').includes('ECONNREFUSED')) {
    console.error(`¿Está levantado el backend en ${BASE}? (docker compose up)`);
  }
  process.exitCode = 1;
});
