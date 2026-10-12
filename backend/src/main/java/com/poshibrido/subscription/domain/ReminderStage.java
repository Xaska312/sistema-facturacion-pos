package com.poshibrido.subscription.domain;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

/**
 * Avisos por correo al dueño, en orden: 7, 3 y 1 día antes (días de calendario en la zona del negocio), al terminar y
 * (si pagaba) al acabarse la gracia. Cada aviso sale una vez por fecha de fin; si se renueva, la cuenta empieza de
 * nuevo. La tarea corre una vez al día: si un día no corre, al siguiente sale el aviso que corresponda.
 */
public enum ReminderStage {
    D7,
    D3,
    D1,
    ENDED,
    BLOCKED;

    public static Optional<ReminderStage> due(boolean trial, Instant endsAt, Duration grace, Instant now, ZoneId zone) {
        if (now.isBefore(endsAt)) {
            long days = calendarDaysLeft(endsAt, now, zone);
            if (days > 7) {
                return Optional.empty();
            }
            return Optional.of(days >= 4 ? D7 : days >= 2 ? D3 : D1);
        }
        if (trial || now.isBefore(endsAt.plus(grace))) {
            return Optional.of(ENDED);
        }
        return Optional.of(BLOCKED);
    }

    /** 0 = termina hoy, 1 = mañana… */
    public static long calendarDaysLeft(Instant endsAt, Instant now, ZoneId zone) {
        return ChronoUnit.DAYS.between(now.atZone(zone).toLocalDate(), endsAt.atZone(zone).toLocalDate());
    }
}
