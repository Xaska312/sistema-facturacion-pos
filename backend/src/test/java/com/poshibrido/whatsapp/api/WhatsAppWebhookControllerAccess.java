package com.poshibrido.whatsapp.api;

/** Acceso a la comprobación de firma (paquete privado) para las pruebas unitarias. */
public final class WhatsAppWebhookControllerAccess {

    private WhatsAppWebhookControllerAccess() {
    }

    public static boolean valid(byte[] body, String header, String secret) {
        return WhatsAppWebhookController.validSignature(body, header, secret);
    }
}
