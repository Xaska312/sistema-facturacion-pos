package com.poshibrido.mail;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;

import java.nio.charset.StandardCharsets;

/** Envío por SMTP (en desarrollo, al buzón de pruebas Mailpit: http://localhost:8025). */
public class SmtpMailSender implements MailSender {

    private final JavaMailSender smtp;
    private final String from;

    public SmtpMailSender(JavaMailSender smtp, String from) {
        this.smtp = smtp;
        this.from = from;
    }

    @Override
    public String name() {
        return "smtp";
    }

    @Override
    public void deliver(MailMessage message) {
        try {
            MimeMessage mime = smtp.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, true, StandardCharsets.UTF_8.name());
            helper.setFrom(from);
            helper.setTo(message.to());
            helper.setSubject(message.subject());
            helper.setText(message.text(), message.html());
            smtp.send(mime);
        } catch (MessagingException | MailException ex) {
            throw new MailDeliveryException("SMTP: " + ex.getMessage(), true, ex);
        }
    }
}
