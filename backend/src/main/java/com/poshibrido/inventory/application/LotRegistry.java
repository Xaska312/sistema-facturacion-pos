package com.poshibrido.inventory.application;

import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.id.Ids;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Lotes de cada producto (tabla {@code lots}, Fase 13-2): número y vencimiento. Un lote se crea la primera vez que
 * entra y se reutiliza después; el mismo número con otro vencimiento es un error de digitación (o un producto
 * adulterado) y se rechaza.
 */
@Component
public class LotRegistry {

    private static final Pattern LOT = Pattern.compile("^[A-Z0-9][A-Z0-9 ./_-]{0,39}$");

    @PersistenceContext
    private EntityManager em;

    /** Número de lote en mayúsculas y sin espacios de sobra; error si no es válido. */
    public static String normalize(String lotNumber) {
        String lot = lotNumber == null ? "" : lotNumber.trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
        if (!LOT.matcher(lot).matches()) {
            throw new BusinessRuleException("El lote \"" + (lotNumber == null ? "" : lotNumber.trim())
                    + "\" no es válido: letras, números, guion o punto (máximo 40).");
        }
        return lot;
    }

    /** Id del lote del producto (lo crea si no existe). */
    @Transactional(propagation = Propagation.MANDATORY)
    public UUID lotFor(UUID productId, String productName, String lotNumber, LocalDate expiration) {
        String lot = normalize(lotNumber);
        List<?> found = em.createNativeQuery(
                "SELECT id, expiration_date FROM lots WHERE product_id = ?1 AND lot_number = ?2 FOR UPDATE")
                .setParameter(1, productId).setParameter(2, lot).getResultList();
        if (!found.isEmpty()) {
            Object[] row = (Object[]) found.getFirst();
            LocalDate known = toDate(row[1]);
            if (known != null && expiration != null && !known.equals(expiration)) {
                throw new BusinessRuleException("El lote " + lot + " de " + productName + " ya está registrado con "
                        + "vencimiento " + known + ", no " + expiration + ". Revisa el empaque.");
            }
            return (UUID) row[0];
        }
        UUID id = Ids.newId();
        em.createNativeQuery("""
                INSERT INTO lots (id, product_id, lot_number, expiration_date, created_at)
                VALUES (?1, ?2, ?3, ?4, now())""")
                .setParameter(1, id).setParameter(2, productId).setParameter(3, lot)
                .setParameter(4, expiration == null ? null : Date.valueOf(expiration)).executeUpdate();
        return id;
    }

    /** Un lote: número y vencimiento. */
    public record LotRef(UUID id, UUID productId, String lotNumber, LocalDate expirationDate) {
    }

    /** El lote del producto con ese número, si existe. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<LotRef> find(UUID productId, String lotNumber) {
        String lot = normalize(lotNumber);
        List<?> found = em.createNativeQuery(
                "SELECT id, expiration_date FROM lots WHERE product_id = ?1 AND lot_number = ?2")
                .setParameter(1, productId).setParameter(2, lot).getResultList();
        if (found.isEmpty()) {
            return Optional.empty();
        }
        Object[] row = (Object[]) found.getFirst();
        return Optional.of(new LotRef((UUID) row[0], productId, lot, toDate(row[1])));
    }

    /** Número y vencimiento de varios lotes (para mostrar documentos y kardex). */
    @Transactional(readOnly = true)
    public Map<UUID, LotRef> refs(Collection<UUID> lotIds) {
        Map<UUID, LotRef> result = new HashMap<>();
        List<UUID> ids = lotIds.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return result;
        }
        for (Object o : em.createNativeQuery(
                "SELECT id, product_id, lot_number, expiration_date FROM lots WHERE id IN (:ids)")
                .setParameter("ids", ids).getResultList()) {
            Object[] row = (Object[]) o;
            result.put((UUID) row[0], new LotRef((UUID) row[0], (UUID) row[1], (String) row[2], toDate(row[3])));
        }
        return result;
    }

    private static LocalDate toDate(Object value) {
        return value == null ? null : value instanceof Date d ? d.toLocalDate() : (LocalDate) value;
    }
}
