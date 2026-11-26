package com.poshibrido.reporting.application;

import com.poshibrido.shared.error.BusinessRuleException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;

/**
 * Rango de fechas de un reporte en la zona horaria del negocio: desde el inicio de {@code from} hasta el final de
 * {@code to} (ambos incluidos). Cada día del negocio empieza a la hora {@code dayStartHour} (decisión 380): con 6, el
 * viernes va del viernes a las 6:00 a. m. al sábado a las 6:00 a. m., y la noche de un bar no se parte en dos.
 */
public record ReportPeriod(LocalDate from, LocalDate to, ZoneId zone, int dayStartHour) {

    /** Rango máximo de un reporte (un año y un día, para comparar un año completo). */
    public static final int MAX_DAYS = 367;

    public ReportPeriod {
        if (dayStartHour < 0 || dayStartHour > 23) {
            throw new IllegalArgumentException("dayStartHour fuera de rango: " + dayStartHour);
        }
    }

    /** Días que empiezan a medianoche. */
    public ReportPeriod(LocalDate from, LocalDate to, ZoneId zone) {
        this(from, to, zone, 0);
    }

    /**
     * @param from nulo = {@code to} (o hoy)
     * @param to   nulo = {@code from} (o hoy)
     */
    public static ReportPeriod of(LocalDate from, LocalDate to, ZoneId zone, LocalDate today) {
        return of(from, to, zone, today, 0);
    }

    public static ReportPeriod of(LocalDate from, LocalDate to, ZoneId zone, LocalDate today, int dayStartHour) {
        LocalDate start = from != null ? from : (to != null ? to : today);
        LocalDate end = to != null ? to : (from != null ? from : today);
        if (end.isBefore(start)) {
            throw new BusinessRuleException("La fecha final no puede ser anterior a la inicial.");
        }
        if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_DAYS) {
            throw new BusinessRuleException("El rango máximo de un reporte es de " + MAX_DAYS + " días.");
        }
        return new ReportPeriod(start, end, zone, dayStartHour);
    }

    /** El día del negocio en curso: antes de la hora de inicio todavía es el día anterior (decisión 380). */
    public static LocalDate businessDay(LocalDateTime localNow, int dayStartHour) {
        return localNow.minusHours(dayStartHour).toLocalDate();
    }

    public Instant start() {
        return from.atTime(LocalTime.of(dayStartHour, 0)).atZone(zone).toInstant();
    }

    /** Exclusivo: inicio del día siguiente a {@code to}. */
    public Instant end() {
        return to.plusDays(1).atTime(LocalTime.of(dayStartHour, 0)).atZone(zone).toInstant();
    }

    /**
     * Expresión SQL de la hora local del negocio corrida para que cada día empiece a {@code dayStartHour}: su fecha es
     * el día del negocio. Usa el parámetro {@code :tz}; la hora se valida al crear el periodo (no viene del usuario).
     */
    public String businessTime(String column) {
        return dayStartHour == 0 ? "(" + column + " AT TIME ZONE :tz)"
                : "(" + column + " AT TIME ZONE :tz - interval '" + dayStartHour + " hours')";
    }

    /** Sufijo para nombres de archivo: {@code 2026-10-01_2026-10-05}. */
    public String label() {
        return from.equals(to) ? from.toString() : from + "_" + to;
    }
}
