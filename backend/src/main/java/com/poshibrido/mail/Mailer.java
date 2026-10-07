package com.poshibrido.mail;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/**
 * Punto único para enviar correos desde los casos de uso.
 * <ul>
 *   <li>Dentro de una transacción, el correo sale <b>después de confirmarla</b>: si la operación falla, no se
 *       envía nada (p. ej. no llega una invitación que no quedó guardada).</li>
 *   <li>En segundo plano (2 hilos) con 3 intentos (0 s, 2 s, 8 s) ante fallas de red, 429 o 5xx: la petición
 *       del usuario no espera al proveedor de correo ni falla si este está caído.</li>
 *   <li>Un correo que no se pudo enviar queda en el log (sin el contenido); el usuario puede pedir reenviarlo.</li>
 * </ul>
 */
@Slf4j
@Component
public class Mailer {

    private static final long[] BACKOFF_MILLIS = {0, 2_000, 8_000};

    private final MailSender sender;
    private final boolean async;
    private final ExecutorService executor;

    public Mailer(MailSender sender, MailProperties properties) {
        this.sender = sender;
        this.async = properties.async();
        this.executor = Executors.newFixedThreadPool(2, runnable -> {
            Thread thread = new Thread(runnable, "mail-sender");
            thread.setDaemon(true);
            return thread;
        });
    }

    public void send(MailMessage message) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatch(message);
                }
            });
        } else {
            dispatch(message);
        }
    }

    private void dispatch(MailMessage message) {
        if (!async) {
            deliverWithRetries(message, false);
            return;
        }
        try {
            executor.execute(() -> deliverWithRetries(message, true));
        } catch (RejectedExecutionException ex) {
            log.error("No se pudo programar el correo '{}' para {}", message.kind(), mask(message.to()), ex);
        }
    }

    private void deliverWithRetries(MailMessage message, boolean wait) {
        for (int attempt = 0; attempt < BACKOFF_MILLIS.length; attempt++) {
            if (attempt > 0 && wait && !sleep(BACKOFF_MILLIS[attempt])) {
                return;
            }
            try {
                sender.deliver(message);
                log.info("Correo '{}' enviado a {} ({})", message.kind(), mask(message.to()), sender.name());
                return;
            } catch (MailDeliveryException ex) {
                boolean last = attempt == BACKOFF_MILLIS.length - 1 || !ex.isRetryable() || !wait;
                if (last) {
                    log.error("No se pudo enviar el correo '{}' a {}: {}", message.kind(), mask(message.to()),
                            ex.getMessage());
                    return;
                }
                log.warn("Reintentando el correo '{}' a {}: {}", message.kind(), mask(message.to()), ex.getMessage());
            } catch (RuntimeException ex) {
                log.error("Error inesperado al enviar el correo '{}' a {}", message.kind(), mask(message.to()), ex);
                return;
            }
        }
    }

    private static boolean sleep(long millis) {
        try {
            Thread.sleep(millis);
            return true;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    /** "ana.perez@gmail.com" → "a***@gmail.com" (los logs no guardan correos completos). */
    static String mask(String email) {
        if (email == null) {
            return "?";
        }
        int at = email.indexOf('@');
        return at <= 0 ? "***" : email.charAt(0) + "***" + email.substring(at);
    }

    @PreDestroy
    void shutdown() {
        executor.shutdown();
    }
}
