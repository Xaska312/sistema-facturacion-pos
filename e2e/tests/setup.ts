import { APIRequestContext, Page, expect } from '@playwright/test';
import { confirmEmail } from './mailpit';

/** Ids sembrados en cada negocio nuevo (V2 y V5 de las migraciones del negocio). */
export const UND = '01920000-0000-7000-8000-000000000301';
export const IVA19 = '01920000-0000-7000-8000-000000000401';
export const CAJA_1 = '01920000-0000-7000-8000-000000000201';
export const PASSWORD = 'ClaveE2E-12345';

export type Headers = Record<string, string>;

export interface Business {
  ownerId: string;
  email: string;
  tradeName: string;
  tenantId: string;
  /** Encabezado Authorization del dueño con el negocio elegido. */
  auth: Headers;
  principalId: string;
  productId: string;
  sku: string;
}

export interface Member {
  userId: string;
  email: string;
}

const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function login(request: APIRequestContext, email: string): Promise<{ token: string; userId: string }> {
  const response = await request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  expect(response.ok(), `login de ${email}`).toBeTruthy();
  const session = await response.json();
  return { token: session.accessToken as string, userId: session.user.id as string };
}

async function selectTenant(request: APIRequestContext, platformToken: string, tenantId: string): Promise<Headers> {
  const selected = await request.post('/api/v1/auth/select-tenant', {
    headers: { Authorization: `Bearer ${platformToken}` },
    data: { tenantId },
  });
  expect(selected.ok(), 'elegir negocio').toBeTruthy();
  return { Authorization: `Bearer ${(await selected.json()).accessToken as string}` };
}

/**
 * Usuario nuevo con negocio, un producto ("Gaseosa E2E", precio 2.500) y existencia 10 en la sede principal. Todo por
 * la API; el correo se confirma con el enlace que llega a Mailpit.
 */
export async function prepareBusiness(request: APIRequestContext): Promise<Business> {
  const id = stamp();
  const email = `e2e-${id}@pos.test`;
  const tradeName = `Tienda E2E ${id}`;
  const sku = `E2E-${id}`.toUpperCase();

  expect((await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, fullName: 'Dueño E2E' },
  })).status()).toBe(201);
  // Sin el correo confirmado no se puede crear el negocio: se abre el enlace que llegó a Mailpit.
  await confirmEmail(request, email);
  const owner = await login(request, email);

  const tenant = await request.post('/api/v1/tenants', {
    headers: { Authorization: `Bearer ${owner.token}` },
    data: { slug: `e2e_${id}`, legalName: `${tradeName} S.A.S.`, tradeName, businessType: 'RETAIL' },
  });
  expect(tenant.status()).toBe(201);
  const tenantId = (await tenant.json()).id as string;
  const auth = await selectTenant(request, owner.token, tenantId);

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

  return { ownerId: owner.userId, email, tradeName, tenantId, auth, principalId: principal!.id, productId, sku };
}

/**
 * Invita a una persona nueva con el rol {@code roleCode} (CASHIER, SELLER, WAREHOUSE, ACCOUNTANT…) en la sede
 * principal: se registra, inicia sesión y acepta la invitación (todo por la API).
 */
export async function addMember(request: APIRequestContext, business: Business, roleCode: string): Promise<Member> {
  const roles = (await (await request.get('/api/v1/roles', { headers: business.auth })).json()) as { id: string; code: string }[];
  const role = roles.find((r) => r.code === roleCode);
  expect(role, `rol ${roleCode}`).toBeTruthy();

  const email = `e2e-${roleCode.toLowerCase()}-${stamp()}@pos.test`;
  const invite = await request.post('/api/v1/members/invitations', {
    headers: business.auth,
    data: { email, roleIds: [role!.id], branchIds: [business.principalId] },
  });
  expect(invite.status(), `invitar ${roleCode}`).toBe(201);
  const token = (await invite.json()).token as string;

  expect((await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, fullName: `Usuario ${roleCode}` },
  })).status()).toBe(201);
  const member = await login(request, email);
  const accepted = await request.post('/api/v1/invitations/accept', {
    headers: { Authorization: `Bearer ${member.token}` },
    data: { token },
  });
  expect(accepted.ok(), `aceptar invitación ${roleCode}`).toBeTruthy();
  return { userId: member.userId, email };
}

/** Existencia actual del producto del negocio en la sede principal (unidad base). */
export async function stockOf(request: APIRequestContext, business: Business): Promise<number> {
  const response = await request.get(
    `/api/v1/inventory/balance?branchId=${business.principalId}&productId=${business.productId}`,
    { headers: business.auth },
  );
  expect(response.ok()).toBeTruthy();
  return Number((await response.json()).quantity);
}

/** Inicia sesión por la pantalla y entra al negocio. Marca como vistos los recorridos guiados (tapan la pantalla). */
export async function loginAndEnter(page: Page, userId: string, email: string, tradeName: string): Promise<void> {
  await page.addInitScript((key) => localStorage.setItem(key, '["dashboard","pos"]'), `pos.tours.${userId}`);
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByText(tradeName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app$/);
}
