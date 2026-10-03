import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra la app ya levantada (docker compose up): frontend en E2E_BASE_URL (por defecto
 * http://localhost:4200), que reenvía /api al backend.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
  },
  projects: [
    // Tablet horizontal: la pantalla de venta debe funcionar ahí.
    { name: 'tablet-horizontal', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
