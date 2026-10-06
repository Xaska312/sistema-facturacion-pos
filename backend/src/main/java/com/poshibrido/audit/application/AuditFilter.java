package com.poshibrido.audit.application;

import com.poshibrido.shared.error.BusinessRuleException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * Filtros de la auditoría. Fechas en la zona horaria del negocio, ambas incluidas; sin fechas, los últimos 7 días.
 *
 * @param text busca en el id del registro (exacto) y en los datos guardados antes y después (contiene)
 */
public record AuditFilter(LocalDate from, LocalDate to, ZoneId zone, UUID actorId, String entity, String action,
                          String text) {

    public static final int MAX_DAYS = 367;
    static final int DEFAULT_DAYS = 7;
    private static final int MAX_TEXT = 100;

    public static AuditFilter of(LocalDate from, LocalDate to, ZoneId zone, LocalDate today, UUID actorId,
                                 String entity, String action, String text) {
        LocalDate end = to != null ? to : (from != null ? from.plusDays(DEFAULT_DAYS - 1L) : today);
        LocalDate start = from != null ? from : end.minusDays(DEFAULT_DAYS - 1L);
        if (end.isBefore(start)) {
            throw new BusinessRuleException("La fecha final no puede ser anterior a la inicial.");
        }
        if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_DAYS) {
            throw new BusinessRuleException("El rango máximo de la auditoría es de " + MAX_DAYS + " días.");
        }
        String cleanText = blankToNull(text);
        if (cleanText != null && cleanText.length() > MAX_TEXT) {
            cleanText = cleanText.substring(0, MAX_TEXT);
        }
        return new AuditFilter(start, end, zone, actorId, blankToNull(entity), blankToNull(action), cleanText);
    }

    public Instant start() {
        return from.atStartOfDay(zone).toInstant();
    }

    /** Exclusivo: inicio del día siguiente a {@code to}. */
    public Instant end() {
        return to.plusDays(1).atStartOfDay(zone).toInstant();
    }

    /** Sufijo para nombres de archivo: {@code 2026-10-01_2026-10-07}. */
    public String label() {
        return from.equals(to) ? from.toString() : from + "_" + to;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
