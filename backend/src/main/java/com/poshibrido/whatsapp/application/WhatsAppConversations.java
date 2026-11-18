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

/** Conversaciones y mensajes del agente de WhatsApp ({@code platform.wa_*}, decisión 362). */
@Service
public class WhatsAppConversations {

    /** WhatsApp solo deja responder con texto libre hasta 24 horas después del último mensaje de la persona. */
    public static final Duration SERVICE_WINDOW = Duration.ofHours(24);

    public enum Status { BOT, HUMAN, CLOSED }

    public record Conversation(UUID id, String phone, String profileName, Status status, Instant lastInboundAt,
                               String leadName, String leadBusiness, String leadCity, String leadNeed,
                               String handoffReason, Instant handoffAt, Instant createdAt, Instant updatedAt,
                               String lastMessage) {

        /** Todavía se le puede escribir con texto libre. */
        public boolean windowOpen() {
            return lastInboundAt != null && lastInboundAt.isAfter(Instant.now().minus(SERVICE_WINDOW));
        }
    }

    public record Message(UUID id, String author, String body, Instant createdAt) {
    }

    public record Detail(Conversation conversation, boolean windowOpen, List<Message> messages) {
    }

    /** Lo que se sabe de la persona (lo llena el agente). Nulo = no cambia. */
    public record Lead(String name, String business, String city, String need) {
    }

    private static final String COLUMNS = """
            c.id, c.phone, c.profile_name, c.status, c.last_inbound_at, c.lead_name, c.lead_business, c.lead_city,
            c.lead_need, c.handoff_reason, c.handoff_at, c.created_at, c.updated_at,
            (SELECT m.body FROM platform.wa_messages m WHERE m.conversation_id = c.id
              ORDER BY m.created_at DESC LIMIT 1) AS last_message""";

    private static final RowMapper<Conversation> CONVERSATION = (rs, i) -> new Conversation(
            rs.getObject("id", UUID.class), rs.getString("phone"), rs.getString("profile_name"),
            Status.valueOf(rs.getString("status")), instant(rs.getTimestamp("last_inbound_at")),
            rs.getString("lead_name"), rs.getString("lead_business"), rs.getString("lead_city"),
            rs.getString("lead_need"), rs.getString("handoff_reason"), instant(rs.getTimestamp("handoff_at")),
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
        Integer seen = waMessageId == null ? 0 : jdbc.queryForObject(
                "SELECT count(*) FROM platform.wa_messages WHERE wa_message_id = ?", Integer.class, waMessageId);
        if (seen != null && seen > 0) {
            return Optional.empty();
        }
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO platform.wa_conversations (id, phone, profile_name, status, last_inbound_at, updated_at)
                VALUES (?, ?, ?, 'BOT', ?, ?)
                ON CONFLICT (phone) DO UPDATE SET
                    profile_name = coalesce(EXCLUDED.profile_name, platform.wa_conversations.profile_name),
                    status = CASE WHEN platform.wa_conversations.status = 'CLOSED' THEN 'BOT'
                                  ELSE platform.wa_conversations.status END,
                    last_inbound_at = EXCLUDED.last_inbound_at, updated_at = EXCLUDED.updated_at""",
                Ids.newId(), phone, blankToNull(profileName, 120), now, now);
        Conversation conversation = byPhone(phone);
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
                    lead_city = coalesce(?, lead_city), lead_need = coalesce(?, lead_need), updated_at = now()
                 WHERE id = ?""",
                blankToNull(lead.name(), 120), blankToNull(lead.business(), 160), blankToNull(lead.city(), 80),
                blankToNull(lead.need(), 500), conversationId);
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

    private Conversation byPhone(String phone) {
        return jdbc.query("SELECT " + COLUMNS + " FROM platform.wa_conversations c WHERE c.phone = ?",
                CONVERSATION, phone).getFirst();
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    static String blankToNull(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.strip();
        return v.length() > max ? v.substring(0, max) : v;
    }
}
