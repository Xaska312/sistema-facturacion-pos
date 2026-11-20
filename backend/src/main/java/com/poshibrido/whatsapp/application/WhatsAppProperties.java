package com.poshibrido.whatsapp.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Agente de WhatsApp de XASKA (decisión 362). Todo sale de variables de entorno del servidor; ningún valor va en el
 * repositorio.
 *
 * @param verifyToken   texto que se escribe en Meta al registrar el webhook ({@code WHATSAPP_VERIFY_TOKEN})
 * @param appSecret     "clave secreta" de la app de Meta, para comprobar la firma de cada aviso ({@code WHATSAPP_APP_SECRET})
 * @param accessToken   token permanente del usuario del sistema ({@code WHATSAPP_ACCESS_TOKEN})
 * @param phoneNumberId identificador del número en la plataforma de WhatsApp ({@code WHATSAPP_PHONE_NUMBER_ID})
 * @param graphVersion  versión de la API Graph (v25.0)
 * @param handoffEmail  a dónde llega el aviso cuando una conversación pasa a una persona
 * @param async         procesar los mensajes en segundo plano (las pruebas lo apagan)
 * @param followupTemplate plantilla aprobada en Meta para escribirle primero a un cliente (decisión 371)
 * @param templateLanguage idioma de esa plantilla en Meta ("es")
 * @param retentionMonths  meses sin mensajes tras los que se borra una conversación (decisión 372)
 */
@ConfigurationProperties(prefix = "app.whatsapp")
public record WhatsAppProperties(String verifyToken, String appSecret, String accessToken, String phoneNumberId,
                                 String graphVersion, String handoffEmail, Boolean async, String followupTemplate,
                                 String templateLanguage, Integer retentionMonths) {

    public String followup() {
        return present(followupTemplate) ? followupTemplate.strip() : "xaska_seguimiento";
    }

    public String language() {
        return present(templateLanguage) ? templateLanguage.strip() : "es";
    }

    public int retention() {
        return retentionMonths == null || retentionMonths < 1 ? 12 : retentionMonths;
    }

    /** Puede recibir avisos de Meta (token de verificación y clave secreta). */
    public boolean receives() {
        return present(verifyToken) && present(appSecret);
    }

    /** Puede enviar mensajes (token y número). */
    public boolean sends() {
        return present(accessToken) && present(phoneNumberId);
    }

    public String version() {
        return present(graphVersion) ? graphVersion : "v25.0";
    }

    public String handoffTo() {
        return present(handoffEmail) ? handoffEmail : "soporte@xaska.co";
    }

    public boolean background() {
        return async == null || async;
    }

    private static boolean present(String value) {
        return value != null && !value.isBlank();
    }
}
