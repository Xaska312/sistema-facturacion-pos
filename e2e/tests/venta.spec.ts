import { expect, test } from '@playwright/test';
import { PASSWORD, prepareBusiness } from './setup';

test('login → abrir caja → vender → cerrar caja', async ({ page, request }) => {
  const setup = await prepareBusiness(request);

  // Los recorridos guiados ya vistos (si no, su capa tapa la pantalla la primera vez); se prueban en los tests unitarios.
  await page.addInitScript((key) => localStorage.setItem(key, '["dashboard","pos"]'), `pos.tours.${setup.ownerId}`);

  // Login y selección del negocio
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(setup.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByText(setup.tradeName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Primeros pasos' })).toBeVisible();

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

  // Al cerrar se abre el informe con el ticket para imprimir y el resumen por WhatsApp (decisión 259).
  const report = page.getByRole('dialog', { name: 'Cierre de caja' });
  // El diálogo también trae el ticket oculto para imprimir: se revisa el informe en pantalla.
  const onScreen = report.locator('app-cash-report');
  await expect(onScreen.getByText(/Informe de cierre \(Z\)/)).toBeVisible();
  await expect(onScreen.getByText('Cuadrada')).toBeVisible();
  await expect(report.getByRole('button', { name: 'Imprimir ticket' })).toBeVisible();
  await expect(report.getByRole('link', { name: /WhatsApp/ })).toBeVisible();
});
