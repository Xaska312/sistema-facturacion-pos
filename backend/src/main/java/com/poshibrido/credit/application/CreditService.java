package com.poshibrido.credit.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.cash.application.CashApi;
import com.poshibrido.cash.application.CashApi.OpenSession;
import com.poshibrido.cash.application.CashApi.PaymentMethodRef;
import com.poshibrido.credit.application.CreditViews.EntryView;
import com.poshibrido.credit.domain.CreditAccount;
import com.poshibrido.credit.domain.CreditEntry;
import com.poshibrido.credit.domain.CreditEntryType;
import com.poshibrido.credit.infrastructure.CreditEntryRepository;
import com.poshibrido.parties.application.CustomerApi;
import com.poshibrido.parties.application.CustomerApi.CustomerRef;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Abonos de fiado y su anulación (decisión 255). Orden de bloqueos: caja (compartido) → cuenta del cliente, el
 * mismo de las ventas fiadas.
 */
@Service
public class CreditService {

    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9_\\-]{8,100}$");

    private final CreditLedger ledger;
    private final CreditEntryRepository entries;
    private final CreditQueryService queries;
    private final CashApi cash;
    private final CustomerApi customers;
    private final AuditLogger audit;
    private final TransactionTemplate tx;

    @PersistenceContext
    private EntityManager em;

    public CreditService(CreditLedger ledger, CreditEntryRepository entries, CreditQueryService queries, CashApi cash,
                         CustomerApi customers, AuditLogger audit, PlatformTransactionManager transactionManager) {
        this.ledger = ledger;
        this.entries = entries;
        this.queries = queries;
        this.cash = cash;
        this.customers = customers;
        this.audit = audit;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public record PaymentCommand(BigDecimal amount, UUID paymentMethodId, String reference, String notes) {
    }

    /**
     * Abono del cliente. En efectivo entra a la caja abierta de quien lo recibe (sin caja abierta no se puede); con
     * otro medio se asocia a su caja si la tiene abierta. No puede ser mayor que lo que debe. La
     * {@code Idempotency-Key} es obligatoria: repetirla devuelve el mismo abono.
     */
    public EntryView recordPayment(UUID customerId, PaymentCommand command, String idempotencyKey) {
        UUID actor = CurrentActor.requireUserId();
        String key = requireKey(idempotencyKey);
        Optional<EntryView> existing = replay(key, customerId, actor);
        if (existing.isPresent()) {
            return existing.get();
        }
        UUID id;
        try {
            id = tx.execute(status -> pay(customerId, command, key, actor));
        } catch (RuntimeException ex) {
            Optional<EntryView> winner = replay(key, customerId, actor);
            if (winner.isPresent()) {
                return winner.get();
            }
            throw ex;
        }
        return tx.execute(status -> queries.entry(customerId, id));
    }

    private UUID pay(UUID customerId, PaymentCommand c, String key, UUID actor) {
        CustomerRef customer = customers.find(customerId)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado."));
        BigDecimal amount = c.amount() == null ? null : c.amount().setScale(2, RoundingMode.HALF_UP);
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("El abono debe ser mayor que cero.");
        }
        PaymentMethodRef method = c.paymentMethodId() == null ? null : cash.paymentMethods().get(c.paymentMethodId());
        if (method == null || !method.active() || CreditApi.METHOD_CODE.equals(method.code())) {
            throw new BusinessRuleException("Medio de pago no válido para un abono.");
        }
        String reference = blankToNull(c.reference());
        if (method.requiresReference() && reference == null) {
            throw new BusinessRuleException("El pago con " + method.name() + " requiere una referencia.");
        }
        Optional<OpenSession> session = cash.lockOpenSessionOf(actor);
        if (method.affectsCash() && session.isEmpty()) {
            throw new BusinessRuleException("Abre tu caja para recibir abonos en efectivo.");
        }
        CreditAccount account = ledger.lock(customerId);
        if (amount.compareTo(account.getBalance()) > 0) {
            throw new BusinessRuleException(account.getBalance().signum() <= 0
                    ? customer.name() + " no debe nada."
                    : "El abono no puede ser mayor que lo que debe " + customer.name() + ": $ "
                            + CreditLedger.pesos(account.getBalance()) + ".");
        }
        UUID sessionId = session.map(OpenSession::id).orElse(null);
        CreditEntry entry = CreditEntry.record(new CreditEntry.Data(customerId, CreditEntryType.PAYMENT, amount, null,
                null, method.id(), method.code(), reference, blankToNull(c.notes()), sessionId, key, actor));
        em.persist(entry);
        account.apply(entry);
        if (method.affectsCash()) {
            cash.recordCreditPaymentCash(sessionId, amount, entry.getId(), label("Abono de " + customer.name()));
        }
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("customerId", customerId);
        after.put("amount", amount);
        after.put("method", method.code());
        after.put("cashSessionId", sessionId);
        after.put("balance", account.getBalance());
        audit.log("CREDIT_PAYMENT_RECEIVED", "credit_entry", entry.getId(), null, after);
        return entry.getId();
    }

    /**
     * Anula un abono (permiso credit:manage): la deuda vuelve a subir. Si fue en efectivo, el dinero sale de la caja
     * donde entró si sigue abierta; si no, de la caja abierta de quien anula.
     */
    public EntryView voidPayment(UUID entryId, String reason) {
        UUID actor = CurrentActor.requireUserId();
        if (reason == null || reason.isBlank()) {
            throw new BusinessRuleException("El motivo de la anulación es obligatorio.");
        }
        String why = reason.trim();
        CreditEntry reversal = tx.execute(status -> annul(entryId, why, actor));
        // Se responde con el abono anulado (voided, voidReason), no con el movimiento de anulación.
        return tx.execute(status -> queries.entry(reversal.getCustomerId(), entryId));
    }

    private CreditEntry annul(UUID entryId, String reason, UUID actor) {
        CreditEntry payment = entries.findById(entryId)
                .orElseThrow(() -> new NotFoundException("Abono no encontrado."));
        if (payment.getType() != CreditEntryType.PAYMENT) {
            throw new BusinessRuleException("Solo se pueden anular abonos.");
        }
        BigDecimal amount = payment.getAmount().negate();
        PaymentMethodRef method = cash.paymentMethods().get(payment.getPaymentMethodId());
        boolean affectsCash = method != null && method.affectsCash();
        UUID refundSession = null;
        if (affectsCash) {
            refundSession = (payment.getCashSessionId() == null ? Optional.<OpenSession>empty()
                    : cash.lockIfOpen(payment.getCashSessionId()))
                    .or(() -> cash.lockOpenSessionOf(actor))
                    .map(OpenSession::id)
                    .orElseThrow(() -> new BusinessRuleException("La caja donde entró este abono ya se cerró. Abre tu "
                            + "caja para devolver el efectivo y vuelve a anular."));
        }
        CreditAccount account = ledger.lock(payment.getCustomerId());
        if (entries.findByPaymentIdAndType(entryId, CreditEntryType.PAYMENT_VOID).isPresent()) {
            throw new ConflictException("Este abono ya está anulado.");
        }
        String notes = reason.length() > 255 ? reason.substring(0, 255) : reason;
        CreditEntry reversal = CreditEntry.record(new CreditEntry.Data(payment.getCustomerId(),
                CreditEntryType.PAYMENT_VOID, amount, null, entryId, payment.getPaymentMethodId(),
                payment.getMethodCode(), null, notes, refundSession, null, actor));
        em.persist(reversal);
        account.apply(reversal);
        if (refundSession != null) {
            cash.recordCreditPaymentVoidCash(refundSession, amount, entryId, label("Anulación de abono: " + reason));
        }
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("paymentId", entryId);
        after.put("amount", amount);
        after.put("reason", reason);
        after.put("refundCashSessionId", refundSession);
        audit.log("CREDIT_PAYMENT_VOIDED", "credit_entry", entryId, null, after);
        return reversal;
    }

    /** Abono ya registrado con la clave; solo se devuelve si es del mismo cliente y del mismo usuario. */
    private Optional<EntryView> replay(String key, UUID customerId, UUID actor) {
        Optional<EntryView> result = tx.execute(status -> entries.findByIdempotencyKey(key).map(e -> {
            if (!e.getCustomerId().equals(customerId) || !actor.equals(e.getCreatedBy())) {
                throw new ConflictException("Esta Idempotency-Key ya se usó en otro abono.");
            }
            return queries.entry(customerId, e.getId());
        }));
        return result == null ? Optional.empty() : result;
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank()) {
            throw new BusinessRuleException("Falta el encabezado Idempotency-Key.");
        }
        String trimmed = key.trim();
        if (!IDEMPOTENCY_KEY.matcher(trimmed).matches()) {
            throw new BusinessRuleException("Idempotency-Key inválida: usa de 8 a 100 letras, números, '-' o '_'.");
        }
        return trimmed;
    }

    private static String label(String text) {
        return text.length() > 255 ? text.substring(0, 255) : text;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
