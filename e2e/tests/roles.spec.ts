import { APIRequestContext, Locator, Page, expect, request as newRequest, test } from '@playwright/test';
import { Business, Member, addMember, loginAndEnter, prepareBusiness, stockOf } from './setup';

/**
 * Lo que ve y puede hacer cada rol del sistema (QA 7-6d). Un negocio con un miembro por rol; cada prueba entra por la
 * pantalla con ese miembro. El backend exige cada permiso (pruebas de integración); aquí se prueba que la interfaz
 * muestre solo lo que corresponde y que los recorridos propios de cada rol funcionen.
 */

const MENU = [
  'Inicio', 'Vender', 'Mi caja', 'Ventas', 'Historial de caja', 'Reportes', 'Auditoría', 'Productos',
  'Ajustes de catálogo', 'Existencias', 'Movimientos', 'Clientes', 'Proveedores', 'Sucursales', 'Cajas', 'Usuarios',
  'Roles y permisos', 'Ajustes',
] as const;
type MenuLabel = (typeof MENU)[number];

/** Opciones del menú que debe ver cada rol (según los permisos sembrados en V2, V7, V9 y V10). */
const VISIBLE: Record<string, MenuLabel[]> = {
  CASHIER: ['Inicio', 'Vender', 'Mi caja', 'Ventas', 'Productos', 'Existencias', 'Movimientos', 'Clientes', 'Proveedores',
    'Sucursales'],
  SELLER: ['Inicio', 'Vender', 'Mi caja', 'Ventas', 'Productos', 'Existencias', 'Movimientos', 'Clientes', 'Proveedores',
    'Sucursales'],
  WAREHOUSE: ['Inicio', 'Productos', 'Ajustes de catálogo', 'Existencias', 'Movimientos', 'Sucursales'],
  ACCOUNTANT: ['Inicio', 'Ventas', 'Historial de caja', 'Reportes', 'Auditoría', 'Productos', 'Existencias', 'Movimientos',
    'Clientes', 'Proveedores', 'Sucursales', 'Ajustes'],
};

let api: APIRequestContext;
let business: Business;
const members: Record<string, Member> = {};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';
  api = await newRequest.newContext({ baseURL });
  business = await prepareBusiness(api);
  for (const role of Object.keys(VISIBLE)) {
    members[role] = await addMember(api, business, role);
  }
});

test.afterAll(async () => {
  await api?.dispose();
});

/** "Todo" (decisión 263): todos los módulos que permite el rol, agrupados. */
async function modules(page: Page): Promise<Locator> {
  await page.goto('/app/todo');
  return page.getByRole('navigation', { name: 'Todos los módulos' });
}

async function enterAs(page: Page, role: string): Promise<void> {
  await loginAndEnter(page, members[role].userId, members[role].email, business.tradeName);
}

async function expectMenu(page: Page, role: string): Promise<void> {
  // Inicio está siempre en el dock; lo demás se revisa en "Todo".
  await expect(page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Inicio', exact: true }))
    .toBeVisible();
  const menu = await modules(page);
  await expect(menu).toBeVisible();
  for (const label of MENU) {
    if (label === 'Inicio') {
      continue;
    }
    const link = menu.getByRole('link', { name: label, exact: true });
    if (VISIBLE[role].includes(label)) {
      await expect(link, `${role} ve "${label}"`).toBeVisible();
    } else {
      await expect(link, `${role} no ve "${label}"`).toHaveCount(0);
    }
  }
}

async function expectForbidden(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveURL(/\/app\/sin-permiso$/);
  await expect(page.getByRole('heading', { name: 'No tienes permiso para ver esto' })).toBeVisible();
}

test('Cajero: vende y opera caja, sin reportes ni historial de otros', async ({ page }) => {
  await enterAs(page, 'CASHIER');
  await expectMenu(page, 'CASHIER');
  await expectForbidden(page, '/app/reportes');
  await expectForbidden(page, '/app/caja/historial');
  await expectForbidden(page, '/app/usuarios');
});

test('Vendedor: abre su caja y vende; consulta clientes sin crearlos', async ({ page }) => {
  await enterAs(page, 'SELLER');
  await expectMenu(page, 'SELLER');

  // Decisión 201: el Vendedor cobra con su propia caja.
  await (await modules(page)).getByRole('link', { name: 'Vender', exact: true }).click();
  await expect(page).toHaveURL(/\/pos$/);
  await expect(page.getByRole('heading', { name: 'No tienes una caja abierta' })).toBeVisible();
  await page.getByLabel('Base de efectivo').fill('20000');
  await page.getByRole('button', { name: 'Abrir caja' }).click();

  const scanner = page.getByPlaceholder(/Escanea o escribe/);
  await expect(scanner).toBeEnabled();
  await scanner.fill(business.sku);
  await scanner.press('Enter');
  const cart = page.getByRole('complementary', { name: 'Venta actual' });
  await expect(cart.getByText('Gaseosa E2E')).toBeVisible();
  await page.keyboard.press('F4');
  const payment = page.getByRole('dialog', { name: 'Cobrar' });
  await expect(payment).toBeVisible();
  await payment.locator('#pay-0').fill('2500');
  await payment.getByRole('button', { name: /Registrar venta/ }).click();
  const receipt = page.getByRole('dialog', { name: /Venta POS-\d+/ });
  await expect(receipt).toBeVisible();
  await receipt.getByRole('button', { name: /Nueva venta/ }).click();
  await expect(receipt).toBeHidden();

  // Clientes: puede consultar, no crear (no tiene parties:manage).
  await page.goto('/app/clientes');
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo cliente' })).toHaveCount(0);
  await expectForbidden(page, '/app/reportes');
});

test('Bodeguero: registra un ajuste leyendo el código dos veces; no vende', async ({ page }) => {
  await enterAs(page, 'WAREHOUSE');
  await expectMenu(page, 'WAREHOUSE');
  await expectForbidden(page, '/pos');
  await expectForbidden(page, '/app/caja');

  const before = await stockOf(api, business);
  await page.goto('/app/inventario/nuevo/ajuste');
  await page.getByPlaceholder(/Daño, vencimiento/).fill('Mercancía encontrada en bodega');
  // QA UI-6: dos lecturas seguidas del lector suman 2 en la misma línea.
  const scanner = page.getByPlaceholder(/Escanea el código/);
  await scanner.fill(business.sku);
  await scanner.press('Enter');
  await scanner.fill(business.sku);
  await scanner.press('Enter');
  const line = page.getByRole('row', { name: /Gaseosa E2E/ });
  await expect(line).toHaveCount(1);
  await expect(line.getByRole('spinbutton')).toHaveValue('2');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/inventario\/movimientos$/);
  await expect.poll(() => stockOf(api, business)).toBe(before + 2);
});

test('Contador: consulta reportes y auditoría; no vende ni administra usuarios', async ({ page }) => {
  await enterAs(page, 'ACCOUNTANT');
  await expectMenu(page, 'ACCOUNTANT');
  await (await modules(page)).getByRole('link', { name: 'Reportes', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/reportes/);
  await (await modules(page)).getByRole('link', { name: 'Auditoría', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/auditoria/);
  await expectForbidden(page, '/pos');
  await expectForbidden(page, '/app/usuarios');
  await expectForbidden(page, '/app/productos/nuevo');
});
