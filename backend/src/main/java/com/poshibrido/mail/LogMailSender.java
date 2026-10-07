package com.poshibrido.mail;

import lombok.extern.slf4j.Slf4j;

/**
 * Sin Resend ni SMTP configurados: el correo (con su enlace, en texto) queda en el log del backend. Solo para
 * desarrollo; en producción se configura RESEND_API_KEY.
 */
@Slf4j
public class LogMailSender implements MailSender {

    @Override
    public String name() {
        return "log";
    }

    @Override
    public void deliver(MailMessage message) {
        log.info("""
                Correo NO enviado (sin RESEND_API_KEY ni buzón SMTP). Para: {} · Asunto: {}
                ----
                {}
                ----""", message.to(), message.subject(), message.text());
    }
}
