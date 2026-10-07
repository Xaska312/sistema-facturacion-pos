package com.poshibrido.mail;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;

/**
 * Elige cómo salen los correos: Resend si hay {@code RESEND_API_KEY}; si no, SMTP si Spring configuró uno
 * ({@code spring.mail.host}, Mailpit en desarrollo); si no, al log.
 */
@Slf4j
@Configuration(proxyBeanMethods = false)
public class MailConfig {

    /** Otro nombre que {@code mailSender}: ese lo usa Spring Boot para su JavaMailSender (SMTP). */
    @Bean
    public MailSender appMailSender(MailProperties properties, ObjectProvider<JavaMailSender> smtp) {
        if (properties.resendEnabled()) {
            log.info("Correos: Resend (remitente {})", properties.from());
            return new ResendMailSender(properties.resendApiKey().trim(), properties.from());
        }
        JavaMailSender javaMail = smtp.getIfAvailable();
        if (javaMail != null) {
            log.info("Correos: SMTP (buzón de pruebas en desarrollo)");
            return new SmtpMailSender(javaMail, properties.from());
        }
        log.warn("Correos: sin RESEND_API_KEY ni SMTP, se escriben en el log (solo para desarrollo)");
        return new LogMailSender();
    }
}
