package com.poshibrido.cash.application;

import com.poshibrido.cash.domain.CashMovement;
import com.poshibrido.cash.domain.CashMovementType;
import com.poshibrido.cash.domain.CashSession;
import com.poshibrido.cash.domain.PaymentMethod;
import com.poshibrido.cash.domain.CashCount;
import com.poshibrido.cash.infrastructure.CashMovementRepository;
import com.poshibrido.cash.infrastructure.CashSessionRepository;
import com.poshibrido.shared.error.BusinessRuleException;
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
    private static final String CREDIT_PAYMENT_REFERENCE = "CREDIT_PAYMENT";
    private static final String ORDER_PAYMENT_REFERENCE = "ORDER_PAYMENT";
    private static final String TIP_PAYOUT_REFERENCE = "TIP_PAYOUT";
    private static final String SUPPLIER_PAYMENT_REFERENCE = "SUPPLIER_PAYMENT";

    private final CashSessionRepository sessions;
    private final PaymentMethodRepository paymentMethods;
    private final CashMovementRepository movements;

    @PersistenceContext
    private EntityManager em;

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<OpenSession> lockOpenSessionOf(UUID userId) {
        return first(sessions.lockOpenOf(userId));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<OpenSession> lockOpenSessionOfRegister(UUID cashRegisterId) {
        return first(sessions.lockOpenOfRegister(cashRegisterId));
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

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordCreditPaymentCash(UUID sessionId, BigDecimal amount, UUID entryId, String label) {
        em.persist(CashMovement.record(sessionId, CashMovementType.CREDIT_PAYMENT, amount, label,
                CREDIT_PAYMENT_REFERENCE, entryId, null, CurrentActor.userId().orElse(null)));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordCreditPaymentVoidCash(UUID sessionId, BigDecimal amount, UUID entryId, String label) {
        em.persist(CashMovement.record(sessionId, CashMovementType.CREDIT_PAYMENT_VOID, amount, label,
                CREDIT_PAYMENT_REFERENCE, entryId, null, CurrentActor.userId().orElse(null)));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordOrderPaymentCash(UUID sessionId, BigDecimal amount, UUID paymentId, String label) {
        em.persist(CashMovement.record(sessionId, CashMovementType.ORDER_PAYMENT, amount, label,
                ORDER_PAYMENT_REFERENCE, paymentId, null, CurrentActor.userId().orElse(null)));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordOrderRefundCash(UUID sessionId, BigDecimal amount, UUID paymentId, String label) {
        em.persist(CashMovement.record(sessionId, CashMovementType.ORDER_REFUND, amount, label,
                ORDER_PAYMENT_REFERENCE, paymentId, null, CurrentActor.userId().orElse(null)));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordTipCash(UUID sessionId, BigDecimal amount, UUID saleId, String label) {
        em.persist(CashMovement.record(sessionId, CashMovementType.TIP, amount, label, SALE_REFERENCE, saleId, null,
                CurrentActor.userId().orElse(null)));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordTipVoidCash(UUID sessionId, BigDecimal amount, UUID saleId, String label) {
        em.persist(CashMovement.record(sessionId, CashMovementType.TIP_VOID, amount, label, SALE_REFERENCE, saleId,
                null, CurrentActor.userId().orElse(null)));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordTipPayoutCash(UUID sessionId, BigDecimal amount, UUID payoutId, String label) {
        em.persist(CashMovement.record(sessionId, CashMovementType.TIP_PAYOUT, amount, label, TIP_PAYOUT_REFERENCE,
                payoutId, null, CurrentActor.userId().orElse(null)));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public UUID recordSupplierPaymentCash(UUID actorId, BigDecimal amount, UUID paymentId, String label) {
        List<UUID> open = sessions.lockOpenOf(actorId);
        if (open.isEmpty()) {
            throw new BusinessRuleException("Abre tu caja para pagar en efectivo, o elige otro medio de pago.");
        }
        UUID sessionId = open.getFirst();
        if (sessions.lockForOutflow(sessionId).isEmpty()) {
            throw new BusinessRuleException("La sesión de caja está cerrada.");
        }
        CashSession session = sessions.findById(sessionId).orElseThrow();
        em.refresh(session);
        List<BigDecimal> current = movements.totalsByType(sessionId).stream()
                .map(row -> row[1] instanceof BigDecimal d ? d : new BigDecimal(String.valueOf(row[1])))
                .toList();
        if (amount.compareTo(CashCount.expected(session.getOpeningAmount(), current)) > 0) {
            throw new BusinessRuleException("No hay suficiente efectivo en tu caja para ese pago. Elige otro medio de "
                    + "pago o regístralo a crédito.");
        }
        em.persist(CashMovement.record(sessionId, CashMovementType.SUPPLIER_PAYMENT, amount, label,
                SUPPLIER_PAYMENT_REFERENCE, paymentId, null, actorId));
        return sessionId;
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
