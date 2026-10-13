package com.poshibrido.mail;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.util.StringUtils;

/**
 * Elige cómo salen los correos: Resend si hay {@code RESEND_API_KEY}; si no, SMTP si Spring configuró uno
 * ({@code spring.mail.host}: Mailpit en desarrollo, Gmail u otro en el piloto); si no, al log. Un host vacío (producción
 * sin SMTP, {@code SPRING_MAIL_HOST=}) cuenta como "sin SMTP".
 */
@Slf4j
@Configuration(proxyBeanMethods = false)
public class MailConfig {

    /** Otro nombre que {@code mailSender}: ese lo usa Spring Boot para su JavaMailSender (SMTP). */
    @Bean
    public MailSender appMailSender(MailProperties properties, ObjectProvider<JavaMailSender> smtp, Environment env) {
        if (properties.resendEnabled()) {
            log.info("Correos: Resend (remitente {})", properties.from());
            return new ResendMailSender(properties.resendApiKey().trim(), properties.from());
        }
        JavaMailSender javaMail = smtp.getIfAvailable();
        String host = env.getProperty("spring.mail.host");
        if (javaMail != null && StringUtils.hasText(host)) {
            log.info("Correos: SMTP {} (remitente {})", host.trim(), properties.from());
            return new SmtpMailSender(javaMail, properties.from());
        }
        log.warn("Correos: sin RESEND_API_KEY ni SMTP, se escriben en el log (solo para desarrollo)");
        return new LogMailSender();
    }
}
