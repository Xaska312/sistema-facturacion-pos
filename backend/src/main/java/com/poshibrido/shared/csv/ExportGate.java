package com.poshibrido.shared.csv;

import com.poshibrido.shared.error.TooManyRequestsException;
import org.springframework.stereotype.Component;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * Máximo de consultas pesadas a la vez en todo el servidor: exportar ventas una a una o la auditoría (hasta 100.000
 * filas en memoria) y verificar la consistencia del inventario (recorre todo el kardex). Cada una toma una conexión:
 * diez a la vez (de distintos negocios, el límite por usuario no lo evita) podían agotar la memoria o el pool y
 * tumbar las ventas de todos (QA INV-6/INV-7/INV-11).
 */
@Component
public class ExportGate {

    static final int MAX_CONCURRENT = 2;
    private final Semaphore permits = new Semaphore(MAX_CONCURRENT, true);

    public <T> T run(Supplier<T> export) {
        boolean acquired;
        try {
            acquired = permits.tryAcquire(10, TimeUnit.SECONDS);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            acquired = false;
        }
        if (!acquired) {
            throw new TooManyRequestsException(
                    "Hay muchos reportes pesados en curso. Inténtalo de nuevo en unos segundos.");
        }
        try {
            return export.get();
        } finally {
            permits.release();
        }
    }
}
