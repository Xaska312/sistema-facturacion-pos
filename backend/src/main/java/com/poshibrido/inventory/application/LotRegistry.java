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
import java.util.List;
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
            LocalDate known = row[1] == null ? null : row[1] instanceof Date d ? d.toLocalDate() : (LocalDate) row[1];
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
}
