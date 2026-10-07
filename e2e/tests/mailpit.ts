import { APIRequestContext, expect } from '@playwright/test';

/** Buzón de prueba del docker compose de desarrollo (todos los correos del backend llegan ahí). */
export const MAILPIT_URL = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';

interface MailpitSummary {
  ID: string;
  Subject: string;
}

/**
 * Espera el último correo para {@code to} cuyo asunto contiene {@code subject} y devuelve su texto plano.
 * Los correos salen en segundo plano después de responder la API, por eso se reintenta unos segundos.
 */
export async function waitForMail(request: APIRequestContext, to: string, subject: string): Promise<string> {
  let text = '';
  await expect.poll(async () => {
    const search = await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:"${to}"` } });
    if (!search.ok()) {
      return false;
    }
    const { messages } = (await search.json()) as { messages: MailpitSummary[] };
    const found = messages.find((m) => m.Subject.includes(subject)); // el más reciente primero
    if (!found) {
      return false;
    }
    const message = await request.get(`${MAILPIT_URL}/api/v1/message/${found.ID}`);
    text = ((await message.json()) as { Text: string }).Text;
    return true;
  }, { message: `Correo "${subject}" para ${to} en Mailpit (${MAILPIT_URL})`, timeout: 20_000 }).toBeTruthy();
  return text;
}

/** Abre (por la API) el enlace "Confirmar mi correo" que llegó a {@code email}. */
export async function confirmEmail(request: APIRequestContext, email: string): Promise<void> {
  const text = await waitForMail(request, email, 'Confirma tu correo');
  const token = /verificar-correo\?token=([A-Za-z0-9_-]+)/.exec(text)?.[1];
  expect(token, 'enlace de confirmación en el correo').toBeTruthy();
  expect((await request.post('/api/v1/auth/verify-email', { data: { token } })).status()).toBe(204);
}
