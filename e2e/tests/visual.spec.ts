import { Page, expect, test } from '@playwright/test';
import { Business, PASSWORD, prepareBusiness } from './setup';

/**
 * Capturas de referencia para el cambio de PrimeNG por componentes propios (decisión 335).
 * No corre con el resto de los e2e: solo con VISUAL=1.
 *
 *   1) Antes de tocar nada (en main):   $env:VISUAL=1; npx playwright test visual --update-snapshots
 *   2) Después de cada fase:            $env:VISUAL=1; npx playwright test visual
 *
 * Las imágenes quedan en tests/visual.spec.ts-snapshots/ (no se commitean: dependen de las fuentes del equipo).
 * Si algo cambia, el reporte HTML (npx playwright show-report) muestra antes, después y la diferencia.
 */
test.skip(!process.env['VISUAL'], 'Capturas visuales: correr con VISUAL=1');
test.describe.configure({ mode: 'serial' });

const THEMES = ['light', 'dark'] as const;
const VIEWPORTS = { escritorio: { width: 1280, height: 800 }, celular: { width: 390, height: 844 } } as const;

/** Correo que se muestra en el menú de usuario durante las capturas. */
const FIXED_EMAIL = 'dueno@negocio-e2e.co';

let business: Business;

test.beforeAll(async ({ request }) => {
  business = await prepareBusiness(request);
});

/** Lo que cambia en cada corrida (nombre del negocio, fechas y horas) se tapa para no dar falsas diferencias. */
function masks(page: Page) {
  return [
    page.getByText(business.tradeName),
    page.getByText(business.email),
    page.locator('time'),
    // El saludo de Inicio cambia con la hora del día.
    page.getByText(/^Buen(os días|as tardes|as noches)/),
  ];
}

async function shot(page: Page, name: string, settle = true, maxDiffPixelRatio = 0.01) {
  if (settle) await page.waitForLoadState('networkidle');
  // soft: compara todas las pantallas aunque una cambie, para ver el panorama completo en el reporte.
  await expect.soft(page).toHaveScreenshot(`${name}.png`, { fullPage: false, mask: masks(page), maxDiffPixelRatio });
}

async function enter(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(business.email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

let run = 0;
for (const theme of THEMES) {
  for (const [device, viewport] of Object.entries(VIEWPORTS)) {
    const doc = String(1110456780 + run++); // número fijo por prueba: igual en cada corrida
    test(`pantallas clave · ${theme} · ${device}`, async ({ page }) => {
      const tag = `${theme}-${device}`;
      await page.setViewportSize(viewport);
      await page.addInitScript(
        ([t, key]) => {
          localStorage.setItem('pos.theme', t);
          localStorage.setItem(key, '["dashboard","pos"]');
        },
        [theme, `pos.tours.${business.ownerId}`] as const,
      );
      // El correo de cada corrida es distinto y su largo cambia el ancho del menú de usuario: se muestra uno fijo.
      await page.route('**/api/v1/auth/**', async (route) => {
        const response = await route.fetch();
        const type = response.headers()['content-type'] ?? '';
        if (!type.includes('json')) {
          await route.fulfill({ response });
          return;
        }
        const body = await response.json();
        if (body?.user?.email) {
          body.user.email = FIXED_EMAIL;
        }
        await route.fulfill({ response, json: body });
      });

      // Públicas
      await page.goto('/login');
      await shot(page, `01-login-${tag}`);
      await page.goto('/precios');
      await shot(page, `02-precios-${tag}`);

      // Dentro del negocio
      await enter(page);
      await shot(page, `03-inicio-${tag}`);
      await page.goto('/app/productos');
      await expect(page.getByText('Gaseosa E2E').first()).toBeVisible();
      await shot(page, `04-productos-${tag}`);
      await page.goto('/app/pos');
      await shot(page, `05-vender-sin-caja-${tag}`);

      // Diálogo de formulario, confirmación de cambios sin guardar y aviso
      await page.goto('/app/clientes');
      await page.getByRole('button', { name: 'Nuevo cliente' }).click();
      const dialog = page.getByRole('dialog', { name: 'Nuevo cliente' });
      await expect(dialog).toBeVisible();
      await shot(page, `06-dialogo-formulario-${tag}`);
      await dialog.getByLabel('Número').fill(doc);
      await dialog.getByLabel('Nombres').fill('María');
      await dialog.getByLabel('Apellidos').fill('Rodríguez');
      await page.keyboard.press('Escape');
      const confirm = page.getByRole('alertdialog', { name: 'Descartar cambios' });
      await expect(confirm).toBeVisible();
      await shot(page, `07-confirmacion-${tag}`);
      await page.keyboard.press('Escape'); // Escape en la confirmación = seguir editando
      await expect(confirm).toBeHidden();
      await dialog.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByText('Cliente guardado')).toBeVisible();
      await shot(page, `08-aviso-${tag}`);

      // Menú emergente del usuario
      await page.getByRole('button', { name: /^Menú de usuario/ }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.waitForTimeout(400); // el menú termina de abrir y de acomodarse junto al botón
      await shot(page, `09-menu-usuario-${tag}`);
      await page.keyboard.press('Escape');

      // Carga (esqueletos): se frena la respuesta de productos para verlos
      await page.route('**/api/v1/products**', async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });
      await page.goto('/app/productos');
      await expect(page.locator('app-skeleton').first()).toBeVisible();
      await shot(page, `10-cargando-${tag}`, false);
    });
  }
}
