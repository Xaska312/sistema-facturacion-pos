package com.poshibrido.mail;

/** Entrega de un correo (Resend, SMTP o log). Lanza {@link MailDeliveryException} si falla. */
public interface MailSender {

    void deliver(MailMessage message);

    /** Nombre para los logs. */
    String name();
}
