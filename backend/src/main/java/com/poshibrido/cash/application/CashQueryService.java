package com.poshibrido.cash.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.cash.application.CashViews.CashSection;
import com.poshibrido.cash.application.CashViews.MovementView;
import com.poshibrido.cash.application.CashViews.PaymentMethodView;
import com.poshibrido.cash.application.CashViews.SessionReport;
import com.poshibrido.cash.application.CashViews.SessionView;
import com.poshibrido.cash.application.SessionSalesSummary.Summary;
import com.poshibrido.cash.domain.CashCount;
import com.poshibrido.cash.domain.CashMovement;
import com.poshibrido.cash.domain.CashMovementType;
import com.poshibrido.cash.domain.CashSession;
import com.poshibrido.cash.domain.CashSessionStatus;
import com.poshibrido.cash.infrastructure.CashMovementRepository;
import com.poshibrido.cash.infrastructure.CashSessionRepository;
import com.poshibrido.cash.infrastructure.PaymentMethodRepository;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.organization.application.CashRegisterApi;
import com.poshibrido.organization.application.CashRegisterApi.RegisterRef;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.security.CurrentActor;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Consultas de caja: sesiones, movimientos e informe de cierre. */
@Service
@RequiredArgsConstructor
public class CashQueryService {

    private static final Instant MIN = Instant.parse("2000-01-01T00:00:00Z");
    private static final Instant MAX = Instant.parse("2999-01-01T00:00:00Z");

    private final CashSessionRepository sessions;
    private final CashMovementRepository movements;
    private final PaymentMethodRepository paymentMethods;
    private final CashRegisterApi registers;
    private final MemberDirectory memberDirectory;
    private final BusinessSettingsApi settings;
    private final SessionSalesSummary salesSummary;

    @Transactional(readOnly = true)
    public List<PaymentMethodView> paymentMethods() {
        return paymentMethods.findAllByOrderBySortOrderAscNameAsc().stream()
                .filter(m -> m.isActive())
                .map(m -> new PaymentMethodView(m.getId(), m.getCode(), m.getName(), m.isAffectsCash(),
                        m.isRequiresReference()))
                .toList();
    }

    /** Historial de sesiones (permiso cash:read). Fechas de apertura en la zona horaria del negocio. */
    @Transactional(readOnly = true)
    public Page<SessionView> search(UUID registerId, UUID branchId, CashSessionStatus status, UUID userId,
                                    LocalDate from, LocalDate to, int page, int size) {
        ZoneId zone = ZoneId.of(settings.current().timezone());
        Instant start = from == null ? MIN : from.atStartOfDay(zone).toInstant();
        Instant end = to == null ? MAX : to.plusDays(1).atStartOfDay(zone).toInstant();
        UUID none = new UUID(0, 0);
        Page<CashSession> result = sessions.search(registerId == null, registerId == null ? none : registerId,
                branchId == null, branchId == null ? none : branchId,
                status == null, status == null ? CashSessionStatus.OPEN : status,
                userId == null, userId == null ? none : userId,
                start, end, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)));
        Map<UUID, RegisterRef> registerById = registerMap();
        Map<UUID, String> names = names(result.getContent());
        return result.map(s -> toView(s, registerById, names));
    }

    @Transactional(readOnly = true)
    public SessionView session(UUID id) {
        CashSession session = readable(id);
        return toView(session, registerMap(), names(List.of(session)));
    }

    @Transactional(readOnly = true)
    public List<MovementView> movements(UUID sessionId) {
        readable(sessionId);
        List<CashMovement> list = movements.findByCashSessionIdOrderByEntryNoAsc(sessionId);
        Map<UUID, String> names = memberDirectory.displayNames(
                list.stream().map(CashMovement::getCreatedBy).filter(Objects::nonNull).collect(Collectors.toSet()));
        return list.stream().map(m -> toView(m, names)).toList();
    }

    /** Informe de cierre (Z); si la sesión sigue abierta es un parcial (X). */
    @Transactional(readOnly = true)
    public SessionReport report(UUID sessionId) {
        CashSession session = readable(sessionId);
        return buildReport(session);
    }

    // ---------------------------------------------------------------- uso interno del módulo

    public SessionReport buildReport(CashSession session) {
        boolean audit = CashAccess.canAudit();
        Map<CashMovementType, BigDecimal> totals = new EnumMap<>(CashMovementType.class);
        for (Object[] row : movements.totalsByType(session.getId())) {
            totals.put((CashMovementType) row[0], row[1] instanceof BigDecimal d ? d : new BigDecimal(String.valueOf(row[1])));
        }
        BigDecimal sales = totals.getOrDefault(CashMovementType.SALE, BigDecimal.ZERO);
        BigDecimal voids = totals.getOrDefault(CashMovementType.SALE_VOID, BigDecimal.ZERO);
        BigDecimal incomes = totals.getOrDefault(CashMovementType.INCOME, BigDecimal.ZERO);
        BigDecimal expenses = totals.getOrDefault(CashMovementType.EXPENSE, BigDecimal.ZERO);
        BigDecimal withdrawals = totals.getOrDefault(CashMovementType.WITHDRAWAL, BigDecimal.ZERO);
        BigDecimal expected = session.isOpen()
                ? CashCount.expected(session.getOpeningAmount(), totals.values())
                : session.getExpectedAmount();
        // Cierre ciego: sin cash:audit no se muestra el esperado ni el desglose que permitiría calcularlo.
        CashSection cash = audit
                ? new CashSection(session.getOpeningAmount(), sales, voids, incomes, expenses, withdrawals, expected,
                        session.getCountedAmount(), session.getDifference())
                : new CashSection(session.getOpeningAmount(), null, null, null, null, null, null,
                        session.getCountedAmount(), null);
        Summary summary = salesSummary.summarize(session.getId(), session.getClosedAt());
        SessionView view = toView(session, registerMap(), names(List.of(session)));
        return new SessionReport(view, summary.salesCount(), summary.salesTotal(), summary.voidedCount(),
                summary.voidedTotal(), summary.netSales(), audit ? summary.byMethod() : List.of(),
                summary.voidsHereCount(), summary.voidedAfterCloseCount(), summary.voidedAfterCloseTotal(), cash,
                audit);
    }

    public SessionView toView(CashSession session) {
        return toView(session, registerMap(), names(List.of(session)));
    }

    public MovementView toView(CashMovement m, Map<UUID, String> names) {
        return new MovementView(m.getEntryNo(), m.getId(), m.getType(), m.getAmount(), m.getReason(),
                m.getReferenceType(), m.getReferenceId(), m.getCreatedBy(), names.get(m.getCreatedBy()),
                m.getCreatedAt());
    }

    /** Sesión que el usuario puede ver: con cash:read cualquiera; sin él, solo las propias. */
    private CashSession readable(UUID id) {
        CashSession session = sessions.findById(id)
                .orElseThrow(() -> new NotFoundException("Sesión de caja no encontrada."));
        if (!CashAccess.canReadAll() && !session.getOpenedBy().equals(CurrentActor.requireUserId())) {
            throw new ForbiddenException("Solo puedes ver tus propias sesiones de caja.");
        }
        return session;
    }

    private SessionView toView(CashSession s, Map<UUID, RegisterRef> registerById, Map<UUID, String> names) {
        boolean audit = CashAccess.canAudit();
        RegisterRef register = registerById.get(s.getCashRegisterId());
        UUID actor = CurrentActor.userId().orElse(null);
        return new SessionView(s.getId(), s.getCashRegisterId(), register == null ? null : register.code(),
                register == null ? null : register.name(), s.getBranchId(),
                register == null ? null : register.branchName(), s.getStatus(), s.getOpenedBy(),
                names.get(s.getOpenedBy()), s.getOpenedAt(), s.getOpeningAmount(), s.getOpeningNotes(),
                s.getClosedAt(), s.getClosedBy(), s.getClosedBy() == null ? null : names.get(s.getClosedBy()),
                s.getCountedAmount(), audit ? s.getExpectedAmount() : null, audit ? s.getDifference() : null,
                s.getClosingNotes(), s.getOpenedBy().equals(actor));
    }

    private Map<UUID, RegisterRef> registerMap() {
        return registers.all().stream().collect(Collectors.toMap(RegisterRef::id, Function.identity()));
    }

    private Map<UUID, String> names(List<CashSession> list) {
        Set<UUID> ids = new HashSet<>();
        for (CashSession s : list) {
            ids.add(s.getOpenedBy());
            if (s.getClosedBy() != null) {
                ids.add(s.getClosedBy());
            }
        }
        return memberDirectory.displayNames(new ArrayList<>(ids));
    }
}
