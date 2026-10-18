package com.poshibrido.mail;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Correos de la aplicación, en español, en HTML sencillo (tablas y estilos en línea, como exigen los clientes de
 * correo) y en texto plano. Todo dato que escribe un usuario (nombres, motivos) se escapa: un nombre de negocio
 * con {@code <script>} no puede inyectar HTML en el correo de otra persona.
 */
@Component
public class MailTemplates {

    /** Índigo de XASKA: botón y línea del encabezado (texto blanco encima con contraste 6,3:1). */
    static final String BRAND = "#4f46e5";
    /** Noche de XASKA: el nombre en el encabezado. */
    static final String INK = "#111827";
    static final String PRODUCT = "XASKA POS";
    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter
            .ofPattern("d 'de' MMMM 'de' yyyy, h:mm a", Locale.forLanguageTag("es-CO"));

    private final MailProperties properties;

    public MailTemplates(MailProperties properties) {
        this.properties = properties;
    }

    // ---------------------------------------------------------------- cuenta

    public MailMessage verifyEmail(String to, String name, String token) {
        String link = properties.link("/verificar-correo?token=" + token);
        return message(to, "Confirma tu correo", "verificacion",
                "Hola, " + name + ":",
                List.of("Gracias por registrarte en XASKA POS. Confirma tu correo para poder crear tu negocio."),
                "Confirmar mi correo", link,
                "El enlace vence en 24 horas. Si no creaste esta cuenta, ignora este correo.");
    }

    public MailMessage passwordReset(String to, String name, String token) {
        String link = properties.link("/restablecer-clave?token=" + token);
        return message(to, "Restablece tu contraseña", "restablecer-clave",
                "Hola, " + name + ":",
                List.of("Recibimos una solicitud para cambiar la contraseña de tu cuenta."),
                "Crear una contraseña nueva", link,
                "El enlace vence en 1 hora y sirve una sola vez. Si no lo pediste, ignora este correo: tu contraseña "
                        + "no cambia.");
    }

    public MailMessage passwordChanged(String to, String name, Instant when) {
        return message(to, "Tu contraseña cambió", "clave-cambiada",
                "Hola, " + name + ":",
                List.of("La contraseña de tu cuenta se cambió el " + format(when) + " (hora de Colombia).",
                        "Por seguridad, se cerraron las sesiones abiertas en otros equipos."),
                "Iniciar sesión", properties.link("/login"),
                "Si no fuiste tú, restablece tu contraseña de inmediato desde \"¿Olvidaste tu contraseña?\" y avisa "
                        + "a soporte.");
    }

    // ---------------------------------------------------------------- invitaciones

    public MailMessage invitation(String to, String inviterName, String businessName, List<String> roles,
                                  String token, Instant expiresAt) {
        String link = properties.link("/invitacion/" + token);
        String who = inviterName == null || inviterName.isBlank() ? "Alguien" : inviterName;
        String roleText = roles.isEmpty() ? "" : " como " + String.join(", ", roles);
        return message(to, who + " te invitó a " + businessName, "invitacion",
                "Hola:",
                List.of(who + " te invitó a trabajar en " + businessName + roleText + " en XASKA POS.",
                        "Si aún no tienes cuenta, créala con este mismo correo y luego acepta la invitación."),
                "Ver la invitación", link,
                "La invitación vence el " + format(expiresAt) + ". Si no esperabas este correo, ignóralo.");
    }

    // ---------------------------------------------------------------- negocios (al dueño)

    public MailMessage tenantSuspended(String to, String ownerName, String businessName, String reason) {
        return message(to, businessName + " fue suspendido", "negocio-suspendido",
                "Hola, " + ownerName + ":",
                List.of("Suspendimos el negocio " + businessName + " en XASKA POS. Mientras esté suspendido, nadie "
                                + "puede entrar; los datos (ventas, inventario, clientes) se conservan.",
                        "Motivo: " + (reason == null || reason.isBlank() ? "no indicado" : reason) + "."),
                null, null,
                "Si crees que es un error o quieres reactivarlo, responde a este correo o comunícate con soporte.");
    }

    public MailMessage tenantReactivated(String to, String ownerName, String businessName) {
        return message(to, businessName + " está activo de nuevo", "negocio-reactivado",
                "Hola, " + ownerName + ":",
                List.of("Reactivamos el negocio " + businessName + ". Tú y tu equipo ya pueden volver a entrar."),
                "Entrar", properties.link("/login"),
                null);
    }

    public MailMessage tenantClosed(String to, String ownerName, String businessName) {
        return message(to, "Eliminaste " + businessName, "negocio-cerrado",
                "Hola, " + ownerName + ":",
                List.of("Eliminaste el negocio " + businessName + ". Quedó suspendido: nadie puede entrar y se "
                                + "cerraron las sesiones de tu equipo.",
                        "Los datos no se borraron. Si fue un error, comunícate con soporte para recuperarlo."),
                null, null,
                "Si no fuiste tú, cambia tu contraseña y avisa a soporte de inmediato.");
    }

    // ---------------------------------------------------------------- suscripción (al dueño, fase 8b)

    /** Aviso de 7, 3 y 1 día antes de terminar la prueba o el periodo pagado ({@code daysLeft}: días de calendario). */
    public MailMessage subscriptionEnding(String to, String ownerName, String businessName, String planName,
                                          boolean trial, Instant endsAt, long daysLeft, String paymentInstructions) {
        String when = daysLeft <= 0 ? "hoy" : daysLeft == 1 ? "mañana" : "en " + daysLeft + " días";
        String what = trial ? "La prueba gratis de " + businessName + " termina " + when
                : "El plan " + planName + " de " + businessName + " vence " + when;
        return message(to, what, "suscripcion-por-vencer",
                "Hola, " + ownerName + ":",
                List.of(what + " (" + format(endsAt) + ").",
                        trial ? "Para seguir vendiendo sin interrupciones, activa tu plan antes de esa fecha."
                                : "Renueva antes de esa fecha para seguir vendiendo sin interrupciones.",
                        "Cómo pagar: " + paymentInstructions),
                "Entrar a " + PRODUCT, properties.link("/login"),
                "Tus datos están seguros: si vence, podrás consultarlos y exportarlos.");
    }

    /** La prueba terminó, o el periodo pagado venció y empieza la gracia ({@code graceEndsAt}). */
    public MailMessage subscriptionEnded(String to, String ownerName, String businessName, boolean trial,
                                         Instant graceEndsAt, String paymentInstructions) {
        List<String> paragraphs = trial
                ? List.of("Terminó la prueba gratis de " + businessName + ". Puedes entrar y consultar tu información,"
                        + " pero no registrar ventas ni cambios hasta activar un plan.",
                "Cómo pagar: " + paymentInstructions)
                : List.of("Venció el plan de " + businessName + ". Todo sigue funcionando hasta el "
                        + format(graceEndsAt) + "; después solo se podrá consultar la información.",
                "Cómo pagar: " + paymentInstructions);
        return message(to, trial ? "Terminó la prueba de " + businessName : "Venció el plan de " + businessName,
                "suscripcion-vencida", "Hola, " + ownerName + ":", paragraphs,
                "Entrar a " + PRODUCT, properties.link("/login"),
                "Tus datos no se borran: al renovar, todo sigue donde lo dejaste.");
    }

    /** Se acabó la gracia de un plan pagado: solo lectura. */
    public MailMessage subscriptionBlocked(String to, String ownerName, String businessName,
                                           String paymentInstructions) {
        return message(to, businessName + " quedó en solo consulta", "suscripcion-bloqueada",
                "Hola, " + ownerName + ":",
                List.of("El plan de " + businessName + " sigue sin renovarse. Desde hoy puedes entrar y consultar tu "
                                + "información, pero no registrar ventas ni cambios.",
                        "Cómo pagar: " + paymentInstructions),
                "Entrar a " + PRODUCT, properties.link("/login"),
                "Tus datos no se borran: al renovar, todo sigue donde lo dejaste.");
    }

    public MailMessage subscriptionPaid(String to, String ownerName, String businessName, String planName,
                                        Instant paidUntil) {
        return message(to, "Recibimos tu pago de " + businessName, "suscripcion-pagada",
                "Hola, " + ownerName + ":",
                List.of("Registramos tu pago del plan " + planName + " para " + businessName + ".",
                        "Tu plan está activo hasta el " + format(paidUntil) + "."),
                "Entrar a " + PRODUCT, properties.link("/login"),
                "Gracias por confiar en XASKA POS.");
    }

    // ---------------------------------------------------------------- caja (al dueño, decisión 253)

    /** Lo que muestra el resumen de un cierre de caja; los nombres los escribió el negocio (se escapan). */
    public record CashCloseSummary(String businessName, String registerName, String branchName, String openedBy,
                                   String closedBy, Instant openedAt, Instant closedAt, long salesCount,
                                   BigDecimal salesTotal, long voidedCount, BigDecimal voidedTotal,
                                   List<MethodLine> byMethod, BigDecimal opening, BigDecimal expected,
                                   BigDecimal counted, BigDecimal difference, String notes) {
    }

    public record MethodLine(String name, long count, BigDecimal amount) {
    }

    /** Resumen de un cierre de caja para el dueño: ventas, medios de pago y el arqueo con su diferencia. */
    public MailMessage cashClosed(String to, String ownerName, CashCloseSummary s) {
        String result = differenceText(s.difference());
        List<String[]> rows = new ArrayList<>();
        rows.add(new String[] {"Caja", s.registerName() + (s.branchName() == null ? "" : " · " + s.branchName())});
        rows.add(new String[] {"Abrió", s.openedBy() + " · " + format(s.openedAt())});
        rows.add(new String[] {"Cerró", s.closedBy() + " · " + format(s.closedAt())});
        rows.add(new String[] {"Ventas", s.salesCount() + " por " + money(s.salesTotal())});
        if (s.voidedCount() > 0) {
            rows.add(new String[] {"Anuladas", s.voidedCount() + " por " + money(s.voidedTotal())});
        }
        for (MethodLine m : s.byMethod()) {
            rows.add(new String[] {m.name(), money(m.amount()) + " (" + m.count() + ")"});
        }
        rows.add(new String[] {"Base de efectivo", money(s.opening())});
        rows.add(new String[] {"Efectivo esperado", money(s.expected())});
        rows.add(new String[] {"Efectivo contado", money(s.counted())});
        rows.add(new String[] {"Diferencia", result});
        if (s.notes() != null && !s.notes().isBlank()) {
            rows.add(new String[] {"Notas del cierre", s.notes()});
        }
        String subject = "Cierre de caja " + s.registerName() + " · " + s.businessName()
                + (s.difference() != null && s.difference().signum() != 0 ? " · " + result : "");
        return message(to, subject, "cierre-de-caja", "Hola, " + ownerName + ":",
                List.of(s.closedBy() + " cerró la caja " + s.registerName() + " de " + s.businessName() + "."),
                rows, "Ver el historial de caja", properties.link("/app/caja/historial"),
                "Recibes este correo porque eres el dueño de " + s.businessName()
                        + ". Puedes desactivarlo en Ajustes.");
    }

    /** "Sin diferencia", "Sobran $2.000", "Faltan $1.500". */
    static String differenceText(BigDecimal difference) {
        if (difference == null || difference.signum() == 0) {
            return "Sin diferencia";
        }
        return (difference.signum() > 0 ? "Sobran " : "Faltan ") + money(difference.abs());
    }

    /** Pesos sin decimales y con punto de miles: $1.248.500. */
    static String money(BigDecimal value) {
        if (value == null) {
            return "—";
        }
        DecimalFormatSymbols symbols = new DecimalFormatSymbols(Locale.ROOT);
        symbols.setGroupingSeparator('.');
        symbols.setMinusSign('-');
        DecimalFormat format = new DecimalFormat("#,##0", symbols);
        String digits = format.format(value.abs().setScale(0, RoundingMode.HALF_UP));
        return (value.signum() < 0 ? "-$" : "$") + digits;
    }

    // ---------------------------------------------------------------- formato

    private MailMessage message(String to, String subject, String kind, String greeting, List<String> paragraphs,
                                String buttonLabel, String link, String footnote) {
        return message(to, subject, kind, greeting, paragraphs, List.of(), buttonLabel, link, footnote);
    }

    /** Con {@code rows}: una tabla de dos columnas (concepto y valor) después de los párrafos. */
    private MailMessage message(String to, String subject, String kind, String greeting, List<String> paragraphs,
                                List<String[]> rows, String buttonLabel, String link, String footnote) {
        StringBuilder html = new StringBuilder()
                .append("<!doctype html><html lang=\"es\"><body style=\"margin:0;padding:0;background:#f4f6f6;\">")
                .append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" ")
                .append("style=\"background:#f4f6f6;padding:24px 0;font-family:Arial,Helvetica,sans-serif;\"><tr>")
                .append("<td align=\"center\"><table role=\"presentation\" width=\"560\" cellpadding=\"0\" ")
                .append("cellspacing=\"0\" style=\"max-width:560px;width:100%;background:#ffffff;border-radius:8px;")
                .append("border:1px solid #dfe5e4;\"><tr><td style=\"padding:20px 28px;border-bottom:3px solid ")
                .append(BRAND).append(";font-size:18px;font-weight:bold;letter-spacing:2px;color:").append(INK)
                .append(";\">XASKA <span style=\"font-size:12px;letter-spacing:1px;color:").append(BRAND)
                .append(";\">POS</span></td></tr><tr><td style=\"padding:24px 28px;color:#1f2a2a;font-size:15px;")
                .append("line-height:1.5;\"><p style=\"margin:0 0 12px;\">").append(escape(greeting)).append("</p>");
        for (String paragraph : paragraphs) {
            html.append("<p style=\"margin:0 0 12px;\">").append(escape(paragraph)).append("</p>");
        }
        if (!rows.isEmpty()) {
            html.append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" ")
                    .append("style=\"border-collapse:collapse;margin:8px 0 16px;font-size:14px;\">");
            for (String[] row : rows) {
                html.append("<tr><td style=\"padding:6px 8px 6px 0;border-bottom:1px solid #e5eaea;color:#5b6b6a;\">")
                        .append(escape(row[0])).append("</td><td style=\"padding:6px 0;border-bottom:1px solid #e5eaea;")
                        .append("text-align:right;font-weight:bold;\">").append(escape(row[1])).append("</td></tr>");
            }
            html.append("</table>");
        }
        if (link != null) {
            html.append("<p style=\"margin:20px 0;\"><a href=\"").append(escape(link))
                    .append("\" style=\"display:inline-block;background:").append(BRAND)
                    .append(";color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;")
                    .append("font-weight:bold;\">").append(escape(buttonLabel)).append("</a></p>")
                    .append("<p style=\"margin:0 0 12px;font-size:13px;color:#5b6b6a;\">Si el botón no funciona, ")
                    .append("copia este enlace en el navegador:<br><span style=\"word-break:break-all;\">")
                    .append(escape(link)).append("</span></p>");
        }
        if (footnote != null) {
            html.append("<p style=\"margin:16px 0 0;font-size:13px;color:#5b6b6a;\">").append(escape(footnote))
                    .append("</p>");
        }
        html.append("</td></tr></table></td></tr></table></body></html>");

        StringBuilder text = new StringBuilder(greeting).append("\n\n");
        paragraphs.forEach(p -> text.append(p).append("\n\n"));
        if (!rows.isEmpty()) {
            rows.forEach(r -> text.append(r[0]).append(": ").append(r[1]).append("\n"));
            text.append("\n");
        }
        if (link != null) {
            text.append(buttonLabel).append(": ").append(link).append("\n\n");
        }
        if (footnote != null) {
            text.append(footnote).append("\n\n");
        }
        text.append("— ").append(PRODUCT);
        return new MailMessage(to, subject, html.toString(), text.toString(), UUID.randomUUID().toString(), kind);
    }

    static String format(Instant when) {
        return DATE_TIME.format(when.atZone(BOGOTA));
    }

    /** Escapa texto para HTML (contenido y atributos entre comillas dobles). */
    static String escape(String value) {
        if (value == null) {
            return "";
        }
        StringBuilder out = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '&' -> out.append("&amp;");
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '"' -> out.append("&quot;");
                case '\'' -> out.append("&#39;");
                default -> out.append(c);
            }
        }
        return out.toString();
    }
}
