package com.poshibrido.access.application;

import com.poshibrido.access.domain.Member;
import com.poshibrido.access.infrastructure.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * ¿Sigue activo este miembro en el negocio de la sesión? (decisión 277, hallazgo 2 de la decisión 276). El token de
 * acceso dura 15 minutos y lleva sus permisos; sin esta revisión, a quien desactivan le seguía sirviendo hasta que
 * vencía. Se consulta en cada petición con un token de negocio, guardando la respuesta {@link #TTL} para no ir a la
 * base cada vez; al desactivar o activar a alguien se olvida enseguida (después del commit), así el corte es inmediato
 * en esta instancia del backend (con varias, en máximo {@link #TTL}).
 * <p>
 * Debe llamarse con el negocio ya resuelto (el search_path de la conexión apunta a su schema).
 */
@Component
@RequiredArgsConstructor
public class ActiveMembers {

    static final Duration TTL = Duration.ofSeconds(30);
    private static final int MAX_ENTRIES = 50_000;

    private final MemberRepository members;
    private final ConcurrentHashMap<Key, Entry> cache = new ConcurrentHashMap<>();

    public boolean isActive(UUID tenantId, UUID userId) {
        long now = System.nanoTime();
        Key key = new Key(tenantId, userId);
        Entry entry = cache.get(key);
        if (entry != null && now < entry.expiresAt()) {
            return entry.active();
        }
        boolean active = members.findById(userId).map(Member::isActive).orElse(false);
        if (cache.size() > MAX_ENTRIES) {
            cache.entrySet().removeIf(e -> now >= e.getValue().expiresAt());
        }
        cache.put(key, new Entry(active, now + TTL.toNanos()));
        return active;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void onStatusChanged(MemberStatusChanged event) {
        cache.remove(new Key(event.tenantId(), event.memberId()));
    }

    private record Key(UUID tenantId, UUID userId) {
    }

    private record Entry(boolean active, long expiresAt) {
    }
}
