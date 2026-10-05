import { APIRequestContext, expect, test } from '@playwright/test';

const UND = '01920000-0000-7000-8000-000000000301';
const IVA19 = '01920000-0000-7000-8000-000000000401';
const PASSWORD = 'ClaveE2E-12345';

interface Setup {
  email: string;
  tradeName: string;
  sku: string;
}

/** Usuario nuevo con negocio, un producto con existencia 10 y precio 2.500 (todo por la API). */
async function prepareBusiness(request: APIRequestContext): Promise<Setup> {
  const stamp = Date.now().toString(36);
  const email = `e2e-${stamp}@pos.test`;
  const slug = `e2e_${stamp}`;
  const tradeName = `Tienda E2E ${stamp}`;
  const sku = `E2E-${stamp}`.toUpperCase();

  expect((await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, fullName: 'Cajero E2E' },
  })).status()).toBe(201);
  const login = await request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const platformToken = (await login.json()).accessToken as string;

  const tenant = await request.post('/api/v1/tenants', {
    headers: { Authorization: `Bearer ${platformToken}` },
    data: { slug, legalName: `${tradeName} S.A.S.`, tradeName, businessType: 'RETAIL' },
  });
  expect(tenant.status()).toBe(201);
  const tenantId = (await tenant.json()).id as string;

  const selected = await request.post('/api/v1/auth/select-tenant', {
    headers: { Authorization: `Bearer ${platformToken}` },
    data: { tenantId },
  });
  expect(selected.ok()).toBeTruthy();
  const auth = { Authorization: `Bearer ${(await selected.json()).accessToken as string}` };

  const product = await request.post('/api/v1/products', {
    headers: auth,
    data: { sku, name: 'Gaseosa E2E', baseUnitId: UND, taxId: IVA19, cost: 0, salePrice: 2500, trackInventory: true },
  });
  expect(product.status()).toBe(201);
  const productId = (await product.json()).id as string;

  const branches = await request.get('/api/v1/branches?page=0&size=10', { headers: auth });
  const principal = ((await branches.json()).content as { id: string; code: string }[]).find((b) => b.code === 'PRINCIPAL');
  expect(principal).toBeTruthy();
  expect((await request.post('/api/v1/inventory/initial-balances', {
    headers: auth,
    data: { branchId: principal!.id, lines: [{ productId, quantity: 10, unitCost: 1200 }] },
  })).status()).toBe(201);

  return { email, tradeName, sku };
}

test('login → abrir caja → vender → cerrar caja', async ({ page, request }) => {
  const setup = await prepareBusiness(request);

  // Login y selección del negocio
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(setup.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByText(setup.tradeName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app$/);

  // Abrir caja desde el POS (apertura guiada) con base de 50.000
  await page.getByRole('link', { name: 'Vender' }).first().click();
  await expect(page).toHaveURL(/\/pos$/);
  await expect(page.getByRole('heading', { name: 'No tienes una caja abierta' })).toBeVisible();
  await page.getByLabel('Base de efectivo').fill('50000');
  await page.getByRole('button', { name: 'Abrir caja' }).click();

  // Vender 2 unidades: escanear 2*SKU, tocar la tarjeta (+1) y quitar una con "−" en el carrito
  const scanner = page.getByPlaceholder(/Escanea o escribe/);
  await expect(scanner).toBeEnabled();
  await expect(page.getByText(/CAJA-1 · /)).toBeVisible();
  await scanner.fill(`2*${setup.sku}`);
  await scanner.press('Enter');
  const cart = page.getByRole('complementary', { name: 'Venta actual' });
  await expect(cart.getByText('Gaseosa E2E')).toBeVisible();
  await page.getByRole('button', { name: /^Agregar Gaseosa E2E/ }).click();
  await expect(cart.getByText(/3 UND ×/)).toBeVisible();
  await cart.getByRole('button', { name: 'Uno menos de Gaseosa E2E' }).click();
  await expect(cart.getByText(/2 UND ×/)).toBeVisible();
  await page.keyboard.press('F4');
  const payment = page.getByRole('dialog', { name: 'Cobrar' });
  await expect(payment).toBeVisible();
  await payment.locator('#pay-0').fill('10000');
  await expect(payment.getByText('Cambio')).toBeVisible();
  await payment.getByRole('button', { name: /Registrar venta/ }).click();

  const receipt = page.getByRole('dialog', { name: /Venta POS-1/ });
  await expect(receipt).toBeVisible();
  await expect(receipt.getByText('Cambio: $ 5.000')).toBeVisible();
  await receipt.getByRole('button', { name: /Nueva venta/ }).click();
  await expect(receipt).toBeHidden();

  // Cerrar caja: esperado = 50.000 + 5.000
  await page.getByRole('link', { name: 'Caja', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/caja$/);
  await expect(page.getByText('Venta POS-1')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar caja' }).first().click();
  const closing = page.getByRole('dialog', { name: 'Cerrar caja' });
  await closing.getByLabel('Efectivo contado').fill('55000');
  await closing.getByRole('button', { name: 'Cerrar caja' }).click();

  const report = page.getByRole('dialog', { name: 'Informe de caja' });
  await expect(report.getByText(/Informe de cierre \(Z\)/)).toBeVisible();
  await expect(report.getByText('Cuadrada')).toBeVisible();
});
