package com.poshibrido.cash.application;

import com.poshibrido.cash.domain.CashMovement;
import com.poshibrido.cash.domain.CashMovementType;
import com.poshibrido.cash.domain.CashSession;
import com.poshibrido.cash.domain.PaymentMethod;
import com.poshibrido.cash.infrastructure.CashSessionRepository;
import com.poshibrido.cash.infrastructure.PaymentMethodRepository;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Implementación de {@link CashApi}: sesiones bloqueadas y efectivo de ventas y anulaciones. */
@Component
@RequiredArgsConstructor
public class CashLedger implements CashApi {

    private static final String SALE_REFERENCE = "SALE";

    private final CashSessionRepository sessions;
    private final PaymentMethodRepository paymentMethods;

    @PersistenceContext
    private EntityManager em;

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<OpenSession> lockOpenSessionOf(UUID userId) {
        return first(sessions.lockOpenOf(userId));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<OpenSession> lockIfOpen(UUID sessionId) {
        return first(sessions.lockIfOpen(sessionId));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, PaymentMethodRef> paymentMethods() {
        Map<UUID, PaymentMethodRef> result = new LinkedHashMap<>();
        for (PaymentMethod m : paymentMethods.findAllByOrderBySortOrderAscNameAsc()) {
            result.put(m.getId(), new PaymentMethodRef(m.getId(), m.getCode(), m.getName(), m.isAffectsCash(),
                    m.isRequiresReference(), m.isActive()));
        }
        return result;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordSaleCash(UUID sessionId, BigDecimal amount, UUID saleId, String label) {
        em.persist(CashMovement.record(sessionId, CashMovementType.SALE, amount, label, SALE_REFERENCE, saleId, null,
                CurrentActor.userId().orElse(null)));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordVoidCash(UUID sessionId, BigDecimal amount, UUID saleId, String label) {
        em.persist(CashMovement.record(sessionId, CashMovementType.SALE_VOID, amount, label, SALE_REFERENCE, saleId,
                null, CurrentActor.userId().orElse(null)));
    }

    /** La fila ya está bloqueada: se carga (o relee) la entidad para devolver sus datos actuales. */
    private Optional<OpenSession> first(List<UUID> ids) {
        if (ids.isEmpty()) {
            return Optional.empty();
        }
        CashSession s = sessions.findById(ids.getFirst()).orElseThrow();
        em.refresh(s);
        return Optional.of(new OpenSession(s.getId(), s.getCashRegisterId(), s.getBranchId(), s.getOpenedBy()));
    }
}
