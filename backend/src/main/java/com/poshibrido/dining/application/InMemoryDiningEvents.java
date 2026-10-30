package com.poshibrido.dining.application;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Distribuidor en memoria de {@link DiningEvents} (Fase 12b-4): sirve con un solo servidor, como hoy. Entrega en un
 * hilo aparte para que un cliente lento no demore la petición que publicó, y solo a los suscriptores del mismo negocio
 * que ven la sucursal del aviso (los datos de cada negocio no se cruzan).
 */
@Slf4j
@Component
public class InMemoryDiningEvents implements DiningEvents {

    private final List<Listener> listeners = new CopyOnWriteArrayList<>();
    private final ExecutorService delivery = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "dining-events");
        t.setDaemon(true);
        return t;
    });

    @Override
    public void publish(Event event) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatch(event);
                }
            });
        } else {
            dispatch(event);
        }
    }

    private void dispatch(Event event) {
        delivery.execute(() -> deliverNow(event));
    }

    /** Entrega en el hilo actual (para las pruebas). */
    void deliverNow(Event event) {
        for (Listener listener : listeners) {
            if (!listener.tenantId().equals(event.tenantId()) || !listener.branchIds().contains(event.branchId())) {
                continue;
            }
            boolean alive;
            try {
                alive = listener.deliver(event);
            } catch (RuntimeException ex) {
                log.debug("Aviso no entregado: {}", ex.getMessage());
                alive = false;
            }
            if (!alive) {
                listeners.remove(listener);
            }
        }
    }

    @Override
    public void subscribe(Listener listener) {
        listeners.add(listener);
    }

    @Override
    public void unsubscribe(Listener listener) {
        listeners.remove(listener);
    }

    int size() {
        return listeners.size();
    }

    @PreDestroy
    void stop() {
        delivery.shutdownNow();
    }
}
