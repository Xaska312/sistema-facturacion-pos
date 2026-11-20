package com.poshibrido.whatsapp.application;

import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Conversaciones y mensajes de Aska con quien escribe a XASKA ({@code platform.wa_*}): por WhatsApp (decisión 362) o
 * por el chat de xaska.co (canal WEB, decisión 364).
 */
@Service
public class WhatsAppConversations {

    /** WhatsApp solo deja responder con texto libre hasta 24 horas después del último mensaje de la persona. */
    public static final Duration SERVICE_WINDOW = Duration.ofHours(24);

    public enum Status { BOT, HUMAN, CLOSED }

    public static final String WHATSAPP = "WHATSAPP";
    public static final String WEB = "WEB";

    public record Conversation(UUID id, String channel, String phone, String waUserId, String profileName, Status status, Instant lastInboundAt,
                               String leadName, String leadBusiness, String leadCity, String leadNeed, String leadPhone,
                               String handoffReason, Instant handoffAt, Instant createdAt, Instant updatedAt,
                               String lastMessage) {

        /** Todavía se le puede escribir con texto libre (en la web, siempre: lee las respuestas al volver). */
        public boolean windowOpen() {
            return web() || lastInboundAt != null && lastInboundAt.isAfter(Instant.now().minus(SERVICE_WINDOW));
        }

        public boolean web() {
            return WEB.equals(channel);
        }

        /** A quién se le responde por WhatsApp: el número o, si llegó sin número, su identificador (decisión 368). */
        public String target() {
            return phone != null ? phone : waUserId;
        }
    }

    public record Message(UUID id, String author, String body, Instant createdAt) {
    }

    public record Detail(Conversation conversation, boolean windowOpen, List<Message> messages) {
    }

    /** Lo que se sabe de la persona (lo llena el agente). Nulo = no cambia. */
    public record Lead(String name, String business, String city, String need, String phone) {
    }

    private static final String COLUMNS = """
            c.id, c.channel, c.phone, c.wa_user_id, c.profile_name, c.status, c.last_inbound_at, c.lead_name, c.lead_business, c.lead_city,
            c.lead_need, c.lead_phone, c.handoff_reason, c.handoff_at, c.created_at, c.updated_at,
            (SELECT m.body FROM platform.wa_messages m WHERE m.conversation_id = c.id
              ORDER BY m.created_at DESC LIMIT 1) AS last_message""";

    private static final RowMapper<Conversation> CONVERSATION = (rs, i) -> new Conversation(
            rs.getObject("id", UUID.class), rs.getString("channel"), rs.getString("phone"),
            rs.getString("wa_user_id"), rs.getString("profile_name"),
            Status.valueOf(rs.getString("status")), instant(rs.getTimestamp("last_inbound_at")),
            rs.getString("lead_name"), rs.getString("lead_business"), rs.getString("lead_city"),
            rs.getString("lead_need"), rs.getString("lead_phone"), rs.getString("handoff_reason"), instant(rs.getTimestamp("handoff_at")),
            instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at")),
            rs.getString("last_message"));

    private static final RowMapper<Message> MESSAGE = (rs, i) -> new Message(rs.getObject("id", UUID.class),
            rs.getString("author"), rs.getString("body"), instant(rs.getTimestamp("created_at")));

    private final JdbcTemplate jdbc;

    public WhatsAppConversations(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /**
     * Guarda un mensaje entrante y devuelve su conversación; vacío si ese mensaje ya había llegado (Meta reenvía los
     * avisos que no se confirman a tiempo). Una conversación cerrada vuelve a quedar con el agente.
     */
    @Transactional
    public Optional<Conversation> inbound(String phone, String profileName, String waMessageId, String body) {
        return inbound(phone, null, profileName, waMessageId, body);
    }

    /**
     * Guarda un mensaje entrante y devuelve su conversación; vacío si ese mensaje ya había llegado (Meta reenvía los
     * avisos que no se confirman a tiempo). Una conversación cerrada vuelve a quedar con el agente. Llega con número,
     * con su identificador de usuario (BSUID, decisión 368) o con los dos; si primero llegó sin número y después con
     * él, es la misma conversación.
     */
    @Transactional
    public Optional<Conversation> inbound(String phone, String waUserId, String profileName, String waMessageId,
                                          String body) {
        if (phone == null && waUserId == null) {
            return Optional.empty();
        }
        Integer seen = waMessageId == null ? 0 : jdbc.queryForObject(
                "SELECT count(*) FROM platform.wa_messages WHERE wa_message_id = ?", Integer.class, waMessageId);
        if (seen != null && seen > 0) {
            return Optional.empty();
        }
        Timestamp now = Timestamp.from(Instant.now());
        String name = blankToNull(profileName, 120);
        if (phone != null) {
            if (waUserId != null) {
                // Escribió antes sin número: esa conversación gana el número (si no hay otra con él).
                jdbc.update("""
                        UPDATE platform.wa_conversations SET phone = ? WHERE wa_user_id = ? AND phone IS NULL
                           AND NOT EXISTS (SELECT 1 FROM platform.wa_conversations WHERE phone = ?)""",
                        phone, waUserId, phone);
            }
            jdbc.update("""
                    INSERT INTO platform.wa_conversations (id, phone, wa_user_id, profile_name, status, last_inbound_at,
                                                           updated_at)
                    VALUES (?, ?, ?, ?, 'BOT', ?, ?)
                    ON CONFLICT (phone) DO UPDATE SET
                        wa_user_id = coalesce(platform.wa_conversations.wa_user_id, EXCLUDED.wa_user_id),
                        profile_name = coalesce(EXCLUDED.profile_name, platform.wa_conversations.profile_name),
                        status = CASE WHEN platform.wa_conversations.status = 'CLOSED' THEN 'BOT'
                                      ELSE platform.wa_conversations.status END,
                        last_inbound_at = EXCLUDED.last_inbound_at, updated_at = EXCLUDED.updated_at""",
                    Ids.newId(), phone, waUserId != null && byUserId(waUserId).isEmpty() ? waUserId : null, name,
                    now, now);
        } else {
            jdbc.update("""
                    INSERT INTO platform.wa_conversations (id, wa_user_id, profile_name, status, last_inbound_at,
                                                           updated_at)
                    VALUES (?, ?, ?, 'BOT', ?, ?)
                    ON CONFLICT (wa_user_id) DO UPDATE SET
                        profile_name = coalesce(EXCLUDED.profile_name, platform.wa_conversations.profile_name),
                        status = CASE WHEN platform.wa_conversations.status = 'CLOSED' THEN 'BOT'
                                      ELSE platform.wa_conversations.status END,
                        last_inbound_at = EXCLUDED.last_inbound_at, updated_at = EXCLUDED.updated_at""",
                    Ids.newId(), waUserId, name, now, now);
        }
        Conversation conversation = phone != null ? byPhone(phone) : byUserId(waUserId).orElseThrow();
        try {
            jdbc.update("""
                    INSERT INTO platform.wa_messages (id, conversation_id, author, body, wa_message_id, created_at)
                    VALUES (?, ?, 'CUSTOMER', ?, ?, ?)""",
                    Ids.newId(), conversation.id(), body, waMessageId, now);
        } catch (DuplicateKeyException ex) {
            return Optional.empty();
        }
        return Optional.of(conversation);
    }

    /**
     * Guarda un mensaje del chat de xaska.co y devuelve su conversación (la crea con la primera palabra). Una
     * conversación cerrada vuelve a quedar con Aska.
     */
    @Transactional
    public Conversation webInbound(UUID session, String body) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO platform.wa_conversations (id, channel, web_session, status, last_inbound_at, updated_at)
                VALUES (?, 'WEB', ?, 'BOT', ?, ?)
                ON CONFLICT (web_session) DO UPDATE SET
                    status = CASE WHEN platform.wa_conversations.status = 'CLOSED' THEN 'BOT'
                                  ELSE platform.wa_conversations.status END,
                    last_inbound_at = EXCLUDED.last_inbound_at, updated_at = EXCLUDED.updated_at""",
                Ids.newId(), session, now, now);
        Conversation conversation = jdbc.query("SELECT " + COLUMNS + " FROM platform.wa_conversations c WHERE c.web_session = ?",
                CONVERSATION, session).getFirst();
        jdbc.update("""
                INSERT INTO platform.wa_messages (id, conversation_id, author, body, created_at)
                VALUES (?, ?, 'CUSTOMER', ?, ?)""", Ids.newId(), conversation.id(), body, now);
        return conversation;
    }

    /** La conversación de una sesión del chat de xaska.co, si ya escribió. */
    @Transactional(readOnly = true)
    public Optional<Conversation> byWebSession(UUID session) {
        return jdbc.query("SELECT " + COLUMNS + " FROM platform.wa_conversations c WHERE c.web_session = ?",
                CONVERSATION, session).stream().findFirst();
    }

    /** Respuestas de Aska en todo el chat de xaska.co desde un momento, para el tope diario de la web. */
    @Transactional(readOnly = true)
    public int webBotRepliesSince(Instant since) {
        Integer count = jdbc.queryForObject("""
                SELECT count(*) FROM platform.wa_messages m JOIN platform.wa_conversations c ON c.id = m.conversation_id
                 WHERE c.channel = 'WEB' AND m.author = 'BOT' AND m.created_at >= ?""",
                Integer.class, Timestamp.from(since));
        return count == null ? 0 : count;
    }

    /**
     * La conversación con un número al que XASKA le escribe primero (decisión 371): la crea si no existe y la deja
     * con una persona, para que Aska no responda cuando el cliente conteste.
     */
    @Transactional
    public Conversation followUp(String phone, String name, String business) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO platform.wa_conversations (id, phone, profile_name, lead_name, lead_business, status,
                                                       handoff_reason, handoff_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'HUMAN', 'XASKA le escribió primero', ?, ?)
                ON CONFLICT (phone) DO UPDATE SET status = 'HUMAN',
                    lead_name = coalesce(platform.wa_conversations.lead_name, EXCLUDED.lead_name),
                    lead_business = coalesce(platform.wa_conversations.lead_business, EXCLUDED.lead_business),
                    updated_at = EXCLUDED.updated_at""",
                Ids.newId(), phone, blankToNull(name, 120), blankToNull(name, 120), blankToNull(business, 160), now, now);
        return byPhone(phone);
    }

    /** Borra las conversaciones sin mensajes desde {@code before} (con sus mensajes); devuelve cuántas (decisión 372). */
    @Transactional
    public int purgeOlderThan(Instant before) {
        return jdbc.update("""
                DELETE FROM platform.wa_conversations c
                 WHERE c.updated_at < ?
                   AND NOT EXISTS (SELECT 1 FROM platform.wa_messages m
                                    WHERE m.conversation_id = c.id AND m.created_at >= ?)""",
                Timestamp.from(before), Timestamp.from(before));
    }

    /** Guarda lo que se le envió a la persona (del agente o de alguien de XASKA). */
    @Transactional
    public void outbound(UUID conversationId, String author, String body, String waMessageId) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO platform.wa_messages (id, conversation_id, author, body, wa_message_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)""", Ids.newId(), conversationId, author, body, waMessageId, now);
        jdbc.update("UPDATE platform.wa_conversations SET updated_at = ? WHERE id = ?", now, conversationId);
    }

    /** Los últimos mensajes, del más viejo al más nuevo. */
    @Transactional(readOnly = true)
    public List<Message> recent(UUID conversationId, int limit) {
        return jdbc.query("""
                SELECT * FROM (SELECT id, author, body, created_at FROM platform.wa_messages
                                WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?) last
                 ORDER BY created_at""", MESSAGE, conversationId, limit);
    }

    /** El id de WhatsApp del último mensaje de la persona: si ya no es el que se iba a responder, llegó otro. */
    @Transactional(readOnly = true)
    public String latestInbound(UUID conversationId) {
        List<String> ids = jdbc.queryForList("""
                SELECT wa_message_id FROM platform.wa_messages
                 WHERE conversation_id = ? AND author = 'CUSTOMER' ORDER BY created_at DESC LIMIT 1""",
                String.class, conversationId);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    /** Respuestas del agente desde un momento, para el tope por conversación. */
    @Transactional(readOnly = true)
    public int botRepliesSince(UUID conversationId, Instant since) {
        Integer count = jdbc.queryForObject("""
                SELECT count(*) FROM platform.wa_messages
                 WHERE conversation_id = ? AND author = 'BOT' AND created_at >= ?""",
                Integer.class, conversationId, Timestamp.from(since));
        return count == null ? 0 : count;
    }

    @Transactional
    public void saveLead(UUID conversationId, Lead lead) {
        jdbc.update("""
                UPDATE platform.wa_conversations SET
                    lead_name = coalesce(?, lead_name), lead_business = coalesce(?, lead_business),
                    lead_city = coalesce(?, lead_city), lead_need = coalesce(?, lead_need),
                    lead_phone = coalesce(?, lead_phone), updated_at = now()
                 WHERE id = ?""",
                blankToNull(lead.name(), 120), blankToNull(lead.business(), 160), blankToNull(lead.city(), 80),
                blankToNull(lead.need(), 500), phone(lead.phone()), conversationId);
    }

    /** Pasa la conversación a una persona: el agente deja de responder en ella. */
    @Transactional
    public void handoff(UUID conversationId, String reason) {
        jdbc.update("""
                UPDATE platform.wa_conversations SET status = 'HUMAN', handoff_reason = ?, handoff_at = now(),
                       updated_at = now() WHERE id = ?""", blankToNull(reason, 500), conversationId);
    }

    @Transactional
    public Conversation setStatus(UUID conversationId, Status status) {
        int updated = jdbc.update("UPDATE platform.wa_conversations SET status = ?, updated_at = now() WHERE id = ?",
                status.name(), conversationId);
        if (updated == 0) {
            throw new NotFoundException("No existe esa conversación.");
        }
        return get(conversationId);
    }

    @Transactional(readOnly = true)
    public Conversation get(UUID conversationId) {
        List<Conversation> found = jdbc.query("SELECT " + COLUMNS + " FROM platform.wa_conversations c WHERE c.id = ?",
                CONVERSATION, conversationId);
        if (found.isEmpty()) {
            throw new NotFoundException("No existe esa conversación.");
        }
        return found.getFirst();
    }

    @Transactional(readOnly = true)
    public Detail detail(UUID conversationId) {
        Conversation conversation = get(conversationId);
        return new Detail(conversation, conversation.windowOpen(), recent(conversationId, 200));
    }

    /** Las más recientes primero; con {@code status}, solo esas. */
    @Transactional(readOnly = true)
    public List<Conversation> list(Status status) {
        return status == null
                ? jdbc.query("SELECT " + COLUMNS + " FROM platform.wa_conversations c ORDER BY c.updated_at DESC LIMIT 200",
                        CONVERSATION)
                : jdbc.query("SELECT " + COLUMNS + " FROM platform.wa_conversations c WHERE c.status = ? "
                        + "ORDER BY c.updated_at DESC LIMIT 200", CONVERSATION, status.name());
    }

    /** Antes de que alguien de XASKA responda: la ventana de 24 horas tiene que seguir abierta. */
    public void requireWindow(Conversation conversation) {
        if (!conversation.windowOpen()) {
            throw new BusinessRuleException("Pasaron más de 24 horas desde el último mensaje de esta persona: "
                    + "WhatsApp solo deja escribirle con una plantilla aprobada. Espera a que vuelva a escribir.");
        }
    }

    private Optional<Conversation> byUserId(String waUserId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM platform.wa_conversations c WHERE c.wa_user_id = ?",
                CONVERSATION, waUserId).stream().findFirst();
    }

    private Conversation byPhone(String phone) {
        return jdbc.query("SELECT " + COLUMNS + " FROM platform.wa_conversations c WHERE c.phone = ?",
                CONVERSATION, phone).getFirst();
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    /** Un teléfono que dejó la persona: solo dígitos (con el 57 de Colombia si escribió 10); nulo si no parece uno. */
    static String phone(String value) {
        if (value == null) {
            return null;
        }
        String digits = value.replaceAll("\\D", "");
        if (digits.length() == 10 && digits.startsWith("3")) {
            digits = "57" + digits;
        }
        return digits.length() >= 7 && digits.length() <= 15 ? digits : null;
    }

    static String blankToNull(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.strip();
        return v.length() > max ? v.substring(0, max) : v;
    }
}
