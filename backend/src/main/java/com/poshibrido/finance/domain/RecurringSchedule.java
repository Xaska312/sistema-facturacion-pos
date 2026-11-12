package com.poshibrido.finance.domain;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/**
 * Fechas en que toca pagar un gasto fijo (decisión 321).
 * <ul>
 *   <li>{@code MONTHLY}: cada mes el día elegido; si el mes no lo tiene (31 en abril, 30 en febrero), el último día.</li>
 *   <li>{@code BIWEEKLY}: cada quincena, el 15 y el último día del mes.</li>
 * </ul>
 * Nunca antes de {@code startsOn}.
 */
public record RecurringSchedule(Frequency frequency, Integer dayOfMonth, LocalDate startsOn) {

    public enum Frequency { MONTHLY, BIWEEKLY }

    public RecurringSchedule {
        if (frequency == null || startsOn == null) {
            throw new IllegalArgumentException("Frecuencia y fecha de inicio son obligatorias");
        }
        if (frequency == Frequency.MONTHLY && (dayOfMonth == null || dayOfMonth < 1 || dayOfMonth > 31)) {
            throw new IllegalArgumentException("El día del mes va de 1 a 31");
        }
        if (frequency == Frequency.BIWEEKLY) {
            dayOfMonth = null;
        }
    }

    /** Fechas de pago entre {@code from} y {@code to} (incluidas), de la más antigua a la más reciente. */
    public List<LocalDate> between(LocalDate from, LocalDate to) {
        List<LocalDate> result = new ArrayList<>();
        LocalDate start = from.isBefore(startsOn) ? startsOn : from;
        if (start.isAfter(to)) {
            return result;
        }
        for (YearMonth month = YearMonth.from(start); !month.atDay(1).isAfter(to); month = month.plusMonths(1)) {
            for (LocalDate day : daysOf(month)) {
                if (!day.isBefore(start) && !day.isAfter(to)) {
                    result.add(day);
                }
            }
        }
        return result;
    }

    /** ¿Es {@code date} una fecha de pago de este gasto fijo? */
    public boolean isDue(LocalDate date) {
        return !date.isBefore(startsOn) && daysOf(YearMonth.from(date)).contains(date);
    }

    /** La primera fecha de pago desde {@code from} (incluida). */
    public LocalDate nextFrom(LocalDate from) {
        LocalDate start = from.isBefore(startsOn) ? startsOn : from;
        for (YearMonth month = YearMonth.from(start); ; month = month.plusMonths(1)) {
            for (LocalDate day : daysOf(month)) {
                if (!day.isBefore(start)) {
                    return day;
                }
            }
        }
    }

    private List<LocalDate> daysOf(YearMonth month) {
        if (frequency == Frequency.BIWEEKLY) {
            return List.of(month.atDay(15), month.atEndOfMonth());
        }
        return List.of(month.atDay(Math.min(dayOfMonth, month.lengthOfMonth())));
    }
}
