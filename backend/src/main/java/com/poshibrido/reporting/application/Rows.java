package com.poshibrido.reporting.application;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.util.UUID;

/** Conversión de las columnas de consultas nativas (el tipo Java exacto depende del driver y de Hibernate). */
final class Rows {

    private Rows() {
    }

    static BigDecimal decimal(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        return value instanceof BigDecimal d ? d : new BigDecimal(value.toString());
    }

    static long lng(Object value) {
        return value == null ? 0 : ((Number) value).longValue();
    }

    static String str(Object value) {
        return value == null ? null : value.toString();
    }

    static UUID uuid(Object value) {
        if (value == null) {
            return null;
        }
        return value instanceof UUID u ? u : UUID.fromString(value.toString());
    }

    static Instant instant(Object value) {
        return switch (value) {
            case null -> null;
            case Instant i -> i;
            case OffsetDateTime o -> o.toInstant();
            case ZonedDateTime z -> z.toInstant();
            case Timestamp t -> t.toInstant();
            default -> Instant.parse(value.toString());
        };
    }
}
