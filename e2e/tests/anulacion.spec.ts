import { expect, test } from '@playwright/test';
import { CAJA_1, loginAndEnter, prepareBusiness, stockOf } from './setup';

/** El dueño anula una venta desde "Ventas": queda como Anulada y los productos vuelven al inventario. */
test('anular una venta devuelve la existencia', async ({ page, request }) => {
  const business = await prepareBusiness(request);

  // Caja abierta y una venta de 3 unidades en efectivo (por la API).
  expect((await request.post('/api/v1/cash/sessions', {
    headers: business.auth, data: { cashRegisterId: CAJA_1, openingAmount: 50000 },
  })).status()).toBe(201);
  const methods = (await (await request.get('/api/v1/payment-methods', { headers: business.auth })).json()) as
    { id: string; code: string }[];
  const cash = methods.find((m) => m.code === 'CASH')!.id;
  const sale = await request.post('/api/v1/sales', {
    headers: { ...business.auth, 'Idempotency-Key': `e2e-anulacion-${Date.now()}` },
    data: { items: [{ productId: business.productId, quantity: 3 }], payments: [{ paymentMethodId: cash, amount: 7500 }] },
  });
  expect(sale.status()).toBe(201);
  const number = (await sale.json()).documentNumber as string;
  expect(await stockOf(request, business)).toBe(7);

  await loginAndEnter(page, business.ownerId, business.email, business.tradeName);
  await page.goto('/app/ventas');
  await page.getByRole('row', { name: new RegExp(`${number}\\b`) }).getByRole('button', { name: 'Ver' }).click();
  const detail = page.getByRole('dialog', { name: `Venta ${number}` });
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Anular', exact: true }).click();

  const voidDialog = page.getByRole('dialog', { name: 'Anular venta' });
  await voidDialog.getByLabel('Motivo').fill('Cliente devolvió el producto');
  await voidDialog.getByRole('button', { name: 'Anular venta' }).click();
  await expect(voidDialog).toBeHidden();

  await expect(page.getByRole('row', { name: new RegExp(`${number}\\b`) }).getByText('Anulada')).toBeVisible();
  await expect.poll(() => stockOf(request, business)).toBe(10);
});
