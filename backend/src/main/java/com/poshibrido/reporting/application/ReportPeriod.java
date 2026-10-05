package com.poshibrido.reporting.application;

import com.poshibrido.shared.error.BusinessRuleException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;

/**
 * Rango de fechas de un reporte en la zona horaria del negocio: desde el inicio de {@code from} hasta el final de
 * {@code to} (ambos incluidos).
 */
public record ReportPeriod(LocalDate from, LocalDate to, ZoneId zone) {

    /** Rango máximo de un reporte (un año y un día, para comparar un año completo). */
    public static final int MAX_DAYS = 367;

    /**
     * @param from nulo = {@code to} (o hoy)
     * @param to   nulo = {@code from} (o hoy)
     */
    public static ReportPeriod of(LocalDate from, LocalDate to, ZoneId zone, LocalDate today) {
        LocalDate start = from != null ? from : (to != null ? to : today);
        LocalDate end = to != null ? to : (from != null ? from : today);
        if (end.isBefore(start)) {
            throw new BusinessRuleException("La fecha final no puede ser anterior a la inicial.");
        }
        if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_DAYS) {
            throw new BusinessRuleException("El rango máximo de un reporte es de " + MAX_DAYS + " días.");
        }
        return new ReportPeriod(start, end, zone);
    }

    public Instant start() {
        return from.atStartOfDay(zone).toInstant();
    }

    /** Exclusivo: inicio del día siguiente a {@code to}. */
    public Instant end() {
        return to.plusDays(1).atStartOfDay(zone).toInstant();
    }

    /** Sufijo para nombres de archivo: {@code 2026-10-01_2026-10-05}. */
    public String label() {
        return from.equals(to) ? from.toString() : from + "_" + to;
    }
}
