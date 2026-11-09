package com.poshibrido.ai.application;

import com.poshibrido.ai.application.DailyDigestService.Point;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * El clima del negocio en el Resumen del día (decisión 307). Lo calcula XASKA con las cifras del día, no la IA, para
 * que sea siempre el mismo con los mismos datos: el día frente al mismo día de la semana pasada y lo más grave que
 * encontró Aska. Cada sección (caja, inventario, cobros y pagos) tiene su propio clima según su punto más grave.
 */
public final class DigestWeather {

    private DigestWeather() {
    }

    public record Weather(String code, String emoji, String label) {
    }

    public static final Weather SUNNY = new Weather("SUNNY", "☀️", "Soleado");
    public static final Weather PARTLY = new Weather("PARTLY", "🌤️", "Despejado, con alguna nube");
    public static final Weather CLOUDY = new Weather("CLOUDY", "⛅", "Nublado");
    public static final Weather RAIN = new Weather("RAIN", "🌧️", "Lluvioso");
    public static final Weather STORM = new Weather("STORM", "⛈️", "Tormenta");
    public static final Weather QUIET = new Weather("QUIET", "🌙", "Un día quieto");

    static final List<Weather> ALL = List.of(SUNNY, PARTLY, CLOUDY, RAIN, STORM, QUIET);

    public static Weather of(String code) {
        return ALL.stream().filter(w -> w.code().equals(code)).findFirst().orElse(null);
    }

    /**
     * Tormenta si algún punto es grave; si no, por las ventas frente al mismo día de la semana pasada: menos del 60 %
     * llueve, menos del 95 % está nublado y desde ahí sale el sol (con nubes si hay algo por atender).
     */
    public static Weather overall(BigDecimal today, BigDecimal weekAgo, List<Point> points) {
        if (points.stream().anyMatch(p -> "bad".equals(p.tone()))) {
            return STORM;
        }
        BigDecimal t = today == null ? BigDecimal.ZERO : today;
        BigDecimal w = weekAgo == null ? BigDecimal.ZERO : weekAgo;
        if (t.signum() == 0 && w.signum() == 0) {
            return QUIET;
        }
        if (w.signum() > 0) {
            BigDecimal ratio = t.divide(w, 4, RoundingMode.HALF_UP);
            if (ratio.compareTo(new BigDecimal("0.6")) < 0) {
                return RAIN;
            }
            if (ratio.compareTo(new BigDecimal("0.95")) < 0) {
                return CLOUDY;
            }
        }
        return points.stream().anyMatch(p -> "warning".equals(p.tone())) ? PARTLY : SUNNY;
    }

    /** El clima de una sección: tormenta si hay algo grave, nubes si hay algo por atender, sol si está en orden. */
    public static Weather section(String section, List<Point> points) {
        List<Point> mine = points.stream().filter(p -> section.equals(p.section())).toList();
        if (mine.stream().anyMatch(p -> "bad".equals(p.tone()))) {
            return STORM;
        }
        if (mine.stream().anyMatch(p -> "warning".equals(p.tone()))) {
            return PARTLY;
        }
        return SUNNY;
    }
}
