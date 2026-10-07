package com.poshibrido.support;

import com.poshibrido.mail.MailMessage;
import com.poshibrido.mail.MailSender;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Buzón de los tests: guarda los correos en memoria en vez de enviarlos. */
public class RecordingMailSender implements MailSender {

    private static final Pattern TOKEN = Pattern.compile("[?&/]token=([A-Za-z0-9_-]+)|/invitacion/([A-Za-z0-9_-]+)");

    private final List<MailMessage> sent = new CopyOnWriteArrayList<>();

    @Override
    public void deliver(MailMessage message) {
        sent.add(message);
    }

    @Override
    public String name() {
        return "pruebas";
    }

    public List<MailMessage> sentTo(String email) {
        return sent.stream().filter(m -> m.to().equalsIgnoreCase(email)).toList();
    }

    /** Último correo de ese tipo para ese destinatario. */
    public Optional<MailMessage> last(String email, String kind) {
        List<MailMessage> list = sentTo(email).stream().filter(m -> m.kind().equals(kind)).toList();
        return list.isEmpty() ? Optional.empty() : Optional.of(list.getLast());
    }

    /** Token del enlace del correo (verificación, restablecer o invitación). */
    public static String tokenIn(MailMessage message) {
        Matcher matcher = TOKEN.matcher(message.text());
        if (!matcher.find()) {
            throw new AssertionError("El correo no trae enlace con token: " + message.text());
        }
        return matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
    }
}
