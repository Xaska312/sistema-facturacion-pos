package com.poshibrido.mail;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
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

    static final String BRAND = "#0f766e";
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
                List.of("Gracias por registrarte en POS Híbrido. Confirma tu correo para poder crear tu negocio."),
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
                List.of(who + " te invitó a trabajar en " + businessName + roleText + " en POS Híbrido.",
                        "Si aún no tienes cuenta, créala con este mismo correo y luego acepta la invitación."),
                "Ver la invitación", link,
                "La invitación vence el " + format(expiresAt) + ". Si no esperabas este correo, ignóralo.");
    }

    // ---------------------------------------------------------------- negocios (al dueño)

    public MailMessage tenantSuspended(String to, String ownerName, String businessName, String reason) {
        return message(to, businessName + " fue suspendido", "negocio-suspendido",
                "Hola, " + ownerName + ":",
                List.of("Suspendimos el negocio " + businessName + " en POS Híbrido. Mientras esté suspendido, nadie "
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

    // ---------------------------------------------------------------- formato

    private MailMessage message(String to, String subject, String kind, String greeting, List<String> paragraphs,
                                String buttonLabel, String link, String footnote) {
        StringBuilder html = new StringBuilder()
                .append("<!doctype html><html lang=\"es\"><body style=\"margin:0;padding:0;background:#f4f6f6;\">")
                .append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" ")
                .append("style=\"background:#f4f6f6;padding:24px 0;font-family:Arial,Helvetica,sans-serif;\"><tr>")
                .append("<td align=\"center\"><table role=\"presentation\" width=\"560\" cellpadding=\"0\" ")
                .append("cellspacing=\"0\" style=\"max-width:560px;width:100%;background:#ffffff;border-radius:8px;")
                .append("border:1px solid #dfe5e4;\"><tr><td style=\"padding:20px 28px;border-bottom:3px solid ")
                .append(BRAND).append(";font-size:18px;font-weight:bold;color:").append(BRAND)
                .append(";\">POS Híbrido</td></tr><tr><td style=\"padding:24px 28px;color:#1f2a2a;font-size:15px;")
                .append("line-height:1.5;\"><p style=\"margin:0 0 12px;\">").append(escape(greeting)).append("</p>");
        for (String paragraph : paragraphs) {
            html.append("<p style=\"margin:0 0 12px;\">").append(escape(paragraph)).append("</p>");
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
        if (link != null) {
            text.append(buttonLabel).append(": ").append(link).append("\n\n");
        }
        if (footnote != null) {
            text.append(footnote).append("\n\n");
        }
        text.append("— POS Híbrido");
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
