package com.poshibrido.mail;

/**
 * Un correo listo para enviar.
 *
 * @param idempotencyKey clave para que un reintento no duplique el envío (Resend la respeta 24 h)
 * @param kind           tipo, solo para los logs (p. ej. "verificacion", "invitacion")
 */
public record MailMessage(String to, String subject, String html, String text, String idempotencyKey, String kind) {
}
