package com.poshibrido.credit.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.credit.domain.CreditAccount;
import com.poshibrido.credit.domain.CreditEntry;
import com.poshibrido.credit.domain.CreditEntryType;
import com.poshibrido.credit.infrastructure.CreditEntryRepository;
import com.poshibrido.parties.application.CustomerApi;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** Cuentas de fiado: bloqueo del saldo y movimientos de ventas fiadas (implementa {@link CreditApi}). */
@Component
@RequiredArgsConstructor
public class CreditLedger implements CreditApi {

    /** Fiar por encima del cupo, asignar cupos y anular abonos. */
    static final String MANAGE_PERMISSION = "credit:manage";

    private final CreditEntryRepository entries;
    private final AuditLogger audit;

    @PersistenceContext
    private EntityManager em;

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void chargeSale(Debtor debtor, BigDecimal amount, UUID saleId, UUID cashSessionId, UUID paymentMethodId) {
        if (CustomerApi.FINAL_CONSUMER_ID.equals(debtor.customerId())) {
            throw new BusinessRuleException(
                    "Para fiar, elige el cliente de la venta: al Consumidor final no se le fía.");
        }
        CreditAccount account = lock(debtor.customerId());
        // El cupo se lee con la cuenta ya bloqueada: si el dueño lo bajó mientras tanto, manda el nuevo (QA MON-F5).
        BigDecimal limit = currentLimit(debtor.customerId());
        BigDecimal after = account.getBalance().add(amount);
        if (limit.signum() <= 0 && after.signum() > 0) {
            // Sin cupo solo se fía contra un saldo a favor.
            throw new BusinessRuleException(debtor.name()
                    + " no tiene cupo de fiado. El dueño o un administrador se lo asigna en Clientes.");
        }
        if (after.compareTo(limit) > 0 && !CurrentActor.permissions().contains(MANAGE_PERMISSION)) {
            BigDecimal available = limit.subtract(account.getBalance()).max(BigDecimal.ZERO);
            throw new BusinessRuleException("Esta venta pasa el cupo de fiado de " + debtor.name()
                    + ": tiene disponible $ " + pesos(available) + ". Cobra la diferencia con otro medio de pago.");
        }
        CreditEntry entry = CreditEntry.record(new CreditEntry.Data(debtor.customerId(), CreditEntryType.SALE, amount,
                saleId, null, paymentMethodId, METHOD_CODE, null, null, cashSessionId, null,
                CurrentActor.userId().orElse(null)));
        em.persist(entry);
        account.apply(entry);
        if (after.compareTo(limit) > 0) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("saleId", saleId);
            data.put("creditLimit", limit);
            data.put("balance", account.getBalance());
            audit.log("CREDIT_LIMIT_EXCEEDED", "customer", debtor.customerId(), null, data);
        }
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void reverseSale(UUID saleId) {
        CreditEntry charge = entries.findBySaleIdAndType(saleId, CreditEntryType.SALE).orElse(null);
        if (charge == null || entries.findBySaleIdAndType(saleId, CreditEntryType.SALE_VOID).isPresent()) {
            return;
        }
        CreditAccount account = lock(charge.getCustomerId());
        CreditEntry reversal = CreditEntry.record(new CreditEntry.Data(charge.getCustomerId(),
                CreditEntryType.SALE_VOID, charge.getAmount(), saleId, null, charge.getPaymentMethodId(), METHOD_CODE, null, null, null, null,
                CurrentActor.userId().orElse(null)));
        em.persist(reversal);
        account.apply(reversal);
    }

    /**
     * Cuenta del cliente con bloqueo exclusivo (la crea en cero si no existe). Va después de la caja, el inventario
     * y el consecutivo en el orden de bloqueos.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public CreditAccount lock(UUID customerId) {
        em.createNativeQuery("""
                INSERT INTO credit_accounts (customer_id, balance, updated_at) VALUES (:id, 0, now())
                ON CONFLICT (customer_id) DO NOTHING
                """).setParameter("id", customerId).executeUpdate();
        CreditAccount account = em.find(CreditAccount.class, customerId, LockModeType.PESSIMISTIC_WRITE);
        em.refresh(account);
        return account;
    }

    private BigDecimal currentLimit(UUID customerId) {
        Object value = em.createNativeQuery("SELECT credit_limit FROM customers WHERE party_id = :id")
                .setParameter("id", customerId).getSingleResult();
        return value instanceof BigDecimal d ? d : new BigDecimal(String.valueOf(value));
    }

    /** 1500000 → "1.500.000". */
    static String pesos(BigDecimal value) {
        return String.format(Locale.forLanguageTag("es-CO"), "%,d",
                value.setScale(0, RoundingMode.HALF_UP).longValueExact());
    }
}
