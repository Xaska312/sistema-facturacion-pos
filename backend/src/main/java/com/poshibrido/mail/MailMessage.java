package com.poshibrido.mail;

/**
 * Un correo listo para enviar.
 *
 * @param idempotencyKey clave para que un reintento no duplique el envío (Resend la respeta 24 h)
 * @param kind           tipo, solo para los logs (p. ej. "verificacion", "invitacion")
 * @param senderName     nombre visible del remitente (p. ej. "Aska de XASKA"); nulo = el de {@code MAIL_FROM}. La
 *                       dirección siempre es la de {@code MAIL_FROM}.
 */
public record MailMessage(String to, String subject, String html, String text, String idempotencyKey, String kind,
                          String senderName) {

    public MailMessage(String to, String subject, String html, String text, String idempotencyKey, String kind) {
        this(to, subject, html, text, idempotencyKey, kind, null);
    }

    /** El remitente con el nombre de este correo: "Aska de XASKA <no-responder@xaska.co>". */
    public String from(String configured) {
        if (senderName == null || senderName.isBlank() || configured == null) {
            return configured;
        }
        int open = configured.indexOf('<');
        int close = configured.indexOf('>', open + 1);
        String address = open >= 0 && close > open ? configured.substring(open + 1, close).trim() : configured.trim();
        String name = senderName.replaceAll("[\"<>\\r\\n]", "").trim();
        return name + " <" + address + ">";
    }
}
