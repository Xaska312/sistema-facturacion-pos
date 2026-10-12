package com.poshibrido.subscription.domain;

import java.time.Duration;
import java.time.Instant;

/**
 * Estado que ve el usuario. No se guarda: se calcula con la fecha de fin, así el vencimiento ocurre a la hora exacta
 * sin tareas programadas.
 * <ul>
 *   <li>{@code TRIAL}: prueba gratis vigente.</li>
 *   <li>{@code ACTIVE}: periodo pagado vigente.</li>
 *   <li>{@code PAST_DUE}: el periodo pagado terminó hace menos que la gracia; todo sigue funcionando con aviso.</li>
 *   <li>{@code EXPIRED}: prueba terminada o gracia agotada; solo lectura hasta renovar.</li>
 * </ul>
 */
public enum SubscriptionStatus {
    TRIAL,
    ACTIVE,
    PAST_DUE,
    EXPIRED;

    public static SubscriptionStatus of(boolean trial, Instant endsAt, Duration grace, Instant now) {
        if (now.isBefore(endsAt)) {
            return trial ? TRIAL : ACTIVE;
        }
        if (!trial && now.isBefore(endsAt.plus(grace))) {
            return PAST_DUE;
        }
        return EXPIRED;
    }

    /** Sin pagar, solo se puede consultar. */
    public boolean blocksWrites() {
        return this == EXPIRED;
    }
}
