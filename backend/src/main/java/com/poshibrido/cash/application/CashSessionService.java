package com.poshibrido.cash.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.cash.application.CashViews.MovementView;
import com.poshibrido.cash.application.CashViews.RegisterOption;
import com.poshibrido.cash.application.CashViews.SessionReport;
import com.poshibrido.cash.application.CashViews.SessionView;
import com.poshibrido.cash.domain.CashCount;
import com.poshibrido.cash.domain.CashMovement;
import com.poshibrido.cash.domain.CashMovementType;
import com.poshibrido.cash.domain.CashSession;
import com.poshibrido.cash.domain.CashSessionStatus;
import com.poshibrido.cash.infrastructure.CashMovementRepository;
import com.poshibrido.cash.infrastructure.CashSessionRepository;
import com.poshibrido.organization.application.CashRegisterApi;
import com.poshibrido.organization.application.CashRegisterApi.RegisterRef;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Apertura, movimientos y cierre de caja. */
@Service
public class CashSessionService {

    /** Quien administra sucursales puede abrir caja en cualquiera; los demás, solo en las asignadas. */
    private static final String ALL_BRANCHES = "branches:manage";
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9_\\-]{8,100}$");

    private final CashSessionRepository sessions;
    private final CashMovementRepository movements;
    private final CashRegisterApi registers;
    private final MemberDirectory memberDirectory;
    private final CashQueryService queries;
    private final AuditLogger audit;
    private final CashCloseNotifier closeNotifier;
    private final TransactionTemplate tx;

    public CashSessionService(CashSessionRepository sessions, CashMovementRepository movements,
                              CashRegisterApi registers, MemberDirectory memberDirectory, CashQueryService queries,
                              AuditLogger audit, CashCloseNotifier closeNotifier,
                              PlatformTransactionManager transactionManager) {
        this.sessions = sessions;
        this.movements = movements;
        this.registers = registers;
        this.memberDirectory = memberDirectory;
        this.queries = queries;
        this.audit = audit;
        this.closeNotifier = closeNotifier;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @PersistenceContext
    private EntityManager em;

    /** Cajas activas de las sucursales del usuario, indicando si ya están abiertas. */
    @Transactional(readOnly = true)
    public List<RegisterOption> registersForOpening() {
        UUID actor = CurrentActor.requireUserId();
        Set<UUID> allowed = allowedBranches(actor);
        Map<UUID, CashSession> open = sessions.findByStatus(CashSessionStatus.OPEN).stream()
                .collect(Collectors.toMap(CashSession::getCashRegisterId, s -> s));
        Map<UUID, String> names = memberDirectory.displayNames(
                open.values().stream().map(CashSession::getOpenedBy).toList());
        return registers.all().stream()
                .filter(RegisterRef::usable)
                .filter(r -> allowed == null || allowed.contains(r.branchId()))
                .map(r -> {
                    CashSession session = open.get(r.id());
                    UUID busyBy = session == null ? null : session.getOpenedBy();
                    return new RegisterOption(r.id(), r.code(), r.name(), r.branchId(), r.branchName(),
                            busyBy != null, busyBy == null ? null : names.get(busyBy), r.shared(),
                            session != null && r.shared() ? session.getId() : null);
                })
                .toList();
    }

    /** Sesión donde vende el usuario: la que abrió o la compartida a la que se unió (decisión 256). */
    @Transactional(readOnly = true)
    public Optional<SessionView> current() {
        return sessions.currentOf(CurrentActor.requireUserId()).stream().findFirst()
                .flatMap(sessions::findById)
                .map(queries::toView);
    }

    /**
     * Vender en una caja compartida que abrió otra persona. Quien tiene su propia caja abierta no se une a otra;
     * quien estaba en otra compartida la deja.
     */
    @Transactional
    public SessionView join(UUID sessionId) {
        UUID actor = CurrentActor.requireUserId();
        CashSession session = sessions.findById(sessionId)
                .orElseThrow(() -> new NotFoundException("Sesión de caja no encontrada."));
        if (session.getOpenedBy().equals(actor)) {
            return queries.toView(session);
        }
        RegisterRef register = registers.find(session.getCashRegisterId())
                .orElseThrow(() -> new NotFoundException("Caja registradora no encontrada."));
        // Primero el acceso a la sucursal: a otra sucursal no se le dice nada de sus cajas (QA SEC-F4).
        Set<UUID> allowed = allowedBranches(actor);
        if (allowed != null && !allowed.contains(register.branchId())) {
            throw new ForbiddenException("No tienes acceso a esa sucursal.");
        }
        if (!register.usable()) {
            throw new BusinessRuleException("La caja " + register.code() + " o su sucursal están inactivas.");
        }
        if (!register.shared()) {
            throw new BusinessRuleException("La caja " + register.code()
                    + " es personal: solo vende en ella quien la abrió.");
        }
        sessions.lockMember(actor);
        if (sessions.findByOpenedByAndStatus(actor, CashSessionStatus.OPEN).isPresent()) {
            throw new ConflictException("Tienes tu propia caja abierta. Ciérrala para vender en otra.");
        }
        if (sessions.lockIfOpen(sessionId).isEmpty()) {
            throw new ConflictException("La caja " + register.code() + " ya se cerró.");
        }
        if (sessions.isMember(sessionId, actor)) {
            return queries.toView(session);
        }
        leaveShared(actor);
        sessions.join(sessionId, actor);
        audit.log("CASH_SESSION_JOINED", "cash_session", sessionId, null, Map.of("memberId", actor));
        return queries.toView(session);
    }

    /** Dejar de vender en la caja compartida (no cierra la caja). */
    @Transactional
    public void leave() {
        UUID actor = CurrentActor.requireUserId();
        sessions.lockMember(actor);
        leaveShared(actor);
    }

    /** Deja las cajas compartidas abiertas en las que vendía y lo deja en la auditoría (QA SEC-F6). */
    private void leaveShared(UUID actor) {
        List<UUID> joined = sessions.joinedOpenOf(actor);
        if (joined.isEmpty()) {
            return;
        }
        sessions.leaveOpen(actor);
        for (UUID id : joined) {
            audit.log("CASH_SESSION_LEFT", "cash_session", id, null, Map.of("memberId", actor));
        }
    }

    @Transactional
    public SessionView open(UUID registerId, BigDecimal openingAmount, String notes) {
        UUID actor = CurrentActor.requireUserId();
        RegisterRef register = registers.find(registerId)
                .orElseThrow(() -> new NotFoundException("Caja registradora no encontrada."));
        if (!register.usable()) {
            throw new BusinessRuleException("La caja " + register.code() + " o su sucursal están inactivas.");
        }
        Set<UUID> allowed = allowedBranches(actor);
        if (allowed != null && !allowed.contains(register.branchId())) {
            throw new ForbiddenException("No tienes acceso a la sucursal " + register.branchName() + ".");
        }
        if (openingAmount == null || openingAmount.signum() < 0) {
            throw new BusinessRuleException("La base de apertura no puede ser negativa.");
        }
        sessions.lockMember(actor);
        sessions.findByOpenedByAndStatus(actor, CashSessionStatus.OPEN).ifPresent(s -> {
            throw new ConflictException("Ya tienes una caja abierta. Ciérrala antes de abrir otra.");
        });
        List<CashSession> openOnRegister = sessions.findByStatus(CashSessionStatus.OPEN).stream()
                .filter(s -> s.getCashRegisterId().equals(registerId)).toList();
        if (!openOnRegister.isEmpty()) {
            String who = memberDirectory.displayNames(List.of(openOnRegister.getFirst().getOpenedBy()))
                    .getOrDefault(openOnRegister.getFirst().getOpenedBy(), "otro usuario");
            throw new ConflictException("La caja " + register.code() + " ya está abierta por " + who + ".");
        }
        // Si vendía en una caja compartida, al abrir la suya la deja.
        leaveShared(actor);
        CashSession session = CashSession.open(registerId, register.branchId(), actor, openingAmount, blankToNull(notes));
        try {
            em.persist(session);
            em.flush();
        } catch (DataIntegrityViolationException | jakarta.persistence.PersistenceException ex) {
            // Dos aperturas simultáneas: los índices únicos parciales dejan pasar solo una.
            throw new ConflictException("La caja o el usuario ya tienen una sesión abierta.");
        }
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("cashRegisterId", registerId);
        after.put("openingAmount", session.getOpeningAmount());
        audit.log("CASH_SESSION_OPENED", "cash_session", session.getId(), null, after);
        return queries.toView(session);
    }

    /**
     * Ingreso, egreso o retiro de efectivo en la sesión propia. Con {@code Idempotency-Key}, repetir la petición
     * devuelve el mismo movimiento (también si llegan dos a la vez).
     */
    public MovementView addMovement(UUID sessionId, CashMovementType type, BigDecimal amount, String reason,
                                    String idempotencyKey) {
        UUID actor = CurrentActor.requireUserId();
        String key = normalizeKey(idempotencyKey);
        if (key != null) {
            Optional<MovementView> existing = replay(key, sessionId, actor);
            if (existing.isPresent()) {
                return existing.get();
            }
        }
        UUID id;
        try {
            id = tx.execute(status -> recordMovement(sessionId, type, amount, reason, key, actor));
        } catch (RuntimeException ex) {
            if (key != null) {
                Optional<MovementView> winner = replay(key, sessionId, actor);
                if (winner.isPresent()) {
                    return winner.get();
                }
            }
            throw ex;
        }
        return tx.execute(status -> toView(movements.findById(id).orElseThrow()));
    }

    private UUID recordMovement(UUID sessionId, CashMovementType type, BigDecimal amount, String reason, String key,
                                UUID actor) {
        if (type == null || !type.isManual()) {
            throw new BusinessRuleException("Tipo de movimiento no permitido: usa ingreso, egreso o retiro.");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("El valor debe ser mayor que cero.");
        }
        if (reason == null || reason.isBlank()) {
            throw new BusinessRuleException("El motivo es obligatorio.");
        }
        CashSession session = sessions.findById(sessionId)
                .orElseThrow(() -> new NotFoundException("Sesión de caja no encontrada."));
        boolean opener = session.getOpenedBy().equals(actor);
        if (!opener && !sessions.isMember(sessionId, actor)) {
            throw new ForbiddenException("Solo quien abrió la caja o quien vende en ella registra sus movimientos.");
        }
        if (!opener && type == CashMovementType.WITHDRAWAL && !CashAccess.canAudit()) {
            // Caja compartida (decisión 256): quien se unió registra ingresos y egresos; los retiros, quien la abrió.
            throw new ForbiddenException("Los retiros los registra quien abrió la caja o un administrador.");
        }
        // Las salidas bloquean la sesión en exclusiva: dos a la vez no sacan más de lo que hay (QA MON-F2).
        boolean open = type.isEntry() ? !sessions.lockIfOpen(sessionId).isEmpty()
                : !sessions.lockForOutflow(sessionId).isEmpty();
        if (!open) {
            throw new BusinessRuleException("La sesión de caja está cerrada.");
        }
        if (!type.isEntry()) {
            // Un egreso o retiro no puede sacar más efectivo del que hay (QA DIN-4: 1.500.000 en vez de 150.000). El
            // mensaje no dice cuánto hay: revelaría el esperado del cierre ciego.
            List<BigDecimal> current = movements.totalsByType(sessionId).stream()
                    .map(row -> row[1] instanceof BigDecimal d ? d : new BigDecimal(String.valueOf(row[1])))
                    .toList();
            BigDecimal available = CashCount.expected(session.getOpeningAmount(), current);
            if (amount.compareTo(available) > 0) {
                throw new BusinessRuleException("No puedes sacar $ " + pesos(amount)
                        + ": es más de lo que debería haber en efectivo en la caja. Revisa el valor.");
            }
        }
        CashMovement movement = CashMovement.record(sessionId, type, amount, reason.trim(), null, null, key, actor);
        em.persist(movement);
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("cashSessionId", sessionId);
        after.put("type", type);
        after.put("amount", movement.getAmount());
        after.put("reason", movement.getReason());
        audit.log("CASH_MOVEMENT_CREATED", "cash_movement", movement.getId(), null, after);
        return movement.getId();
    }

    /** 1500000 → "1.500.000". */
    private static String pesos(BigDecimal value) {
        return String.format(Locale.forLanguageTag("es-CO"), "%,d",
                value.setScale(0, RoundingMode.HALF_UP).longValueExact());
    }

    /** Movimiento ya registrado con la clave; solo se devuelve si es de la misma sesión y del mismo usuario. */
    private Optional<MovementView> replay(String key, UUID sessionId, UUID actor) {
        Optional<MovementView> result = tx.execute(status -> movements.findByIdempotencyKey(key).map(m -> {
            if (!m.getCashSessionId().equals(sessionId) || !actor.equals(m.getCreatedBy())) {
                throw new ConflictException("Esta Idempotency-Key ya se usó en otro movimiento.");
            }
            return toView(m);
        }));
        return result == null ? Optional.empty() : result;
    }

    /**
     * Cierre con arqueo ciego: el usuario informa lo contado; el sistema calcula el esperado (apertura + movimientos
     * de efectivo) y la diferencia. Puede cerrar quien abrió la caja o quien tenga cash:audit.
     */
    @Transactional
    public SessionReport close(UUID sessionId, BigDecimal counted, String notes) {
        UUID actor = CurrentActor.requireUserId();
        if (counted == null || counted.signum() < 0) {
            throw new BusinessRuleException("El efectivo contado no puede ser negativo.");
        }
        CashSession session = sessions.lockForClose(sessionId)
                .orElseThrow(() -> new NotFoundException("Sesión de caja no encontrada."));
        if (!session.getOpenedBy().equals(actor) && !CashAccess.canAudit()) {
            throw new ForbiddenException("Solo quien abrió la caja (o un administrador) puede cerrarla.");
        }
        if (!session.isOpen()) {
            throw new ConflictException("La sesión de caja ya está cerrada.");
        }
        BigDecimal expected = CashCount.expected(session.getOpeningAmount(), List.of(movements.sumBySession(sessionId)));
        session.close(counted, expected, actor, blankToNull(notes));
        em.flush();
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("counted", session.getCountedAmount());
        after.put("expected", session.getExpectedAmount());
        after.put("difference", session.getDifference());
        audit.log("CASH_SESSION_CLOSED", "cash_session", sessionId, null, after);
        // Resumen al dueño: se arma después del commit, en su propia transacción (nunca deshace el cierre).
        closeNotifier.sessionClosed(sessionId);
        return queries.buildReport(session);
    }

    /** {@code null} = todas las sucursales. */
    private Set<UUID> allowedBranches(UUID actor) {
        if (CurrentActor.permissions().contains(ALL_BRANCHES)) {
            return null;
        }
        return memberDirectory.branchIdsOf(actor);
    }

    private MovementView toView(CashMovement movement) {
        return queries.toView(movement, memberDirectory.displayNames(
                movement.getCreatedBy() == null ? List.of() : List.of(movement.getCreatedBy())));
    }

    private static String normalizeKey(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        String trimmed = key.trim();
        if (!IDEMPOTENCY_KEY.matcher(trimmed).matches()) {
            throw new BusinessRuleException("Idempotency-Key inválida: usa de 8 a 100 letras, números, '-' o '_'.");
        }
        return trimmed;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
