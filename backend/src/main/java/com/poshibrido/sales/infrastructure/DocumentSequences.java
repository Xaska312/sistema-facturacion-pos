package com.poshibrido.sales.infrastructure;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consecutivos de {@code document_sequences}. El número se toma con la fila bloqueada dentro de la transacción del
 * documento: si la transacción falla, el incremento se deshace y no quedan huecos.
 */
@Component
public class DocumentSequences {

    public record Next(String prefix, long number) {
    }

    @PersistenceContext
    private EntityManager em;

    @Transactional(propagation = Propagation.MANDATORY)
    public Next next(String code) {
        Object[] row = (Object[]) em.createNativeQuery(
                        "SELECT prefix, next_number FROM document_sequences WHERE code = :code FOR UPDATE")
                .setParameter("code", code)
                .getSingleResult();
        long number = ((Number) row[1]).longValue();
        em.createNativeQuery("UPDATE document_sequences SET next_number = next_number + 1, updated_at = now() "
                        + "WHERE code = :code")
                .setParameter("code", code)
                .executeUpdate();
        return new Next((String) row[0], number);
    }
}
