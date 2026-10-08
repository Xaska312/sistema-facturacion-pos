package com.poshibrido.inventory.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.application.InventoryCatalogApi.StockProduct;
import com.poshibrido.inventory.application.InventoryCommands.Direction;
import com.poshibrido.inventory.application.InventoryCommands.Line;
import com.poshibrido.inventory.application.InventoryViews.DocumentView;
import com.poshibrido.inventory.domain.InventoryDocument;
import com.poshibrido.inventory.domain.InventoryDocumentLine;
import com.poshibrido.inventory.domain.InventoryDocumentType;
import com.poshibrido.inventory.domain.MovementType;
import com.poshibrido.inventory.infrastructure.InventoryDocumentRepository;
import com.poshibrido.inventory.infrastructure.StockMovementRepository;
import com.poshibrido.organization.application.BranchApi;
import com.poshibrido.organization.application.BranchApi.BranchRef;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * Documentos de inventario: saldo inicial, ajuste, traslado y conteo físico. Cada documento se
 * registra completo o no se registra (una transacción). Admite {@code Idempotency-Key}: repetir la
 * misma clave devuelve el documento original sin volver a mover existencias.
 */
@Service
public class InventoryDocumentService {

    /** Máximo de NUMERIC(14,4), la columna de cantidades en unidad base. */
    static final BigDecimal MAX_BASE_QUANTITY = new BigDecimal("9999999999.9999");

    public static final String REFERENCE_TYPE = "INVENTORY_DOCUMENT";
    static final int MAX_LINES = 500;
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9_\\-]{8,100}$");

    @PersistenceContext
    private EntityManager em;

    private final StockLedger ledger;
    private final InventoryDocumentRepository documents;
    private final StockMovementRepository movements;
    private final BranchApi branches;
    private final InventoryQueryService queries;
    private final AuditLogger audit;
    private final TransactionTemplate tx;

    public InventoryDocumentService(StockLedger ledger, InventoryDocumentRepository documents,
                                    StockMovementRepository movements, BranchApi branches,
                                    InventoryQueryService queries, AuditLogger audit,
                                    PlatformTransactionManager transactionManager) {
        this.ledger = ledger;
        this.documents = documents;
        this.movements = movements;
        this.branches = branches;
        this.queries = queries;
        this.audit = audit;
        this.tx = new TransactionTemplate(transactionManager);
    }

    // ------------------------------------------------------------------ casos de uso

    public DocumentView initial(InventoryCommands.Initial c, String idempotencyKey) {
        return idempotent(InventoryDocumentType.INITIAL, idempotencyKey, () -> {
            requireActiveBranches(c.branchId());
            List<Line> lines = requireLines(c.lines(), false);
            Set<UUID> productIds = productIds(lines);
            StockLedger.Session session = ledger.open(Set.of(c.branchId()), productIds, productIds);
            for (UUID productId : productIds) {
                if (movements.existsByBranchIdAndProductId(c.branchId(), productId)) {
                    throw new ConflictException("El producto " + session.product(productId).name()
                            + " ya tiene movimientos en esta sucursal. Usa un ajuste.");
                }
            }
            InventoryDocument doc = newDocument(InventoryDocumentType.INITIAL, c.branchId(), null, "Saldo inicial",
                    c.notes(), idempotencyKey);
            int lineNo = 0;
            for (Line line : lines) {
                Resolved r = resolve(session.product(line.productId()), line);
                BigDecimal unitCost = line.unitCost() == null
                        ? session.averageCost(line.productId())
                        : baseCost(line.unitCost(), r.factor());
                persistLine(doc, ++lineNo, line, r, null, unitCost, null, null);
                session.post(c.branchId(), line.productId(), MovementType.INITIAL, r.baseQuantity(), unitCost, false,
                        REFERENCE_TYPE, doc.getId(), doc.getReason());
            }
            return finish(doc);
        });
    }

    public DocumentView adjustment(InventoryCommands.Adjustment c, String idempotencyKey) {
        return idempotent(InventoryDocumentType.ADJUSTMENT, idempotencyKey, () -> {
            requireActiveBranches(c.branchId());
            String reason = requireReason(c.reason());
            List<Line> lines = requireLines(c.lines(), false);
            Set<UUID> costProducts = new HashSet<>();
            for (Line line : lines) {
                if (line.direction() == null) {
                    throw new BusinessRuleException("Indica si cada línea es entrada o salida.");
                }
                if (line.direction() == Direction.OUT && line.unitCost() != null) {
                    throw new BusinessRuleException("Las salidas se valoran al costo promedio; no lleves costo en ellas.");
                }
                if (line.direction() == Direction.IN && line.unitCost() != null) {
                    costProducts.add(line.productId());
                }
            }
            StockLedger.Session session = ledger.open(Set.of(c.branchId()), productIds(lines), costProducts);
            InventoryDocument doc = newDocument(InventoryDocumentType.ADJUSTMENT, c.branchId(), null, reason,
                    c.notes(), idempotencyKey);
            int lineNo = 0;
            for (Line line : lines) {
                Resolved r = resolve(session.product(line.productId()), line);
                boolean in = line.direction() == Direction.IN;
                BigDecimal entryCost = in && line.unitCost() != null ? baseCost(line.unitCost(), r.factor()) : null;
                persistLine(doc, ++lineNo, line, r, line.direction().name(),
                        entryCost != null ? entryCost : session.averageCost(line.productId()), null, null);
                session.post(c.branchId(), line.productId(), in ? MovementType.ADJUSTMENT_IN : MovementType.ADJUSTMENT_OUT,
                        in ? r.baseQuantity() : r.baseQuantity().negate(), entryCost, false,
                        REFERENCE_TYPE, doc.getId(), reason);
            }
            return finish(doc);
        });
    }

    public DocumentView transfer(InventoryCommands.Transfer c, String idempotencyKey) {
        return idempotent(InventoryDocumentType.TRANSFER, idempotencyKey, () -> {
            if (c.fromBranchId().equals(c.toBranchId())) {
                throw new BusinessRuleException("La sucursal de origen y la de destino deben ser distintas.");
            }
            requireActiveBranches(c.fromBranchId(), c.toBranchId());
            List<Line> lines = requireLines(c.lines(), false);
            StockLedger.Session session = ledger.open(Set.of(c.fromBranchId(), c.toBranchId()), productIds(lines),
                    Set.of());
            InventoryDocument doc = newDocument(InventoryDocumentType.TRANSFER, c.fromBranchId(), c.toBranchId(),
                    "Traslado entre sucursales", c.notes(), idempotencyKey);
            int lineNo = 0;
            for (Line line : lines) {
                Resolved r = resolve(session.product(line.productId()), line);
                persistLine(doc, ++lineNo, line, r, null, session.averageCost(line.productId()), null, null);
                session.post(c.fromBranchId(), line.productId(), MovementType.TRANSFER_OUT, r.baseQuantity().negate(),
                        null, false, REFERENCE_TYPE, doc.getId(), doc.getReason());
                session.post(c.toBranchId(), line.productId(), MovementType.TRANSFER_IN, r.baseQuantity(),
                        null, false, REFERENCE_TYPE, doc.getId(), doc.getReason());
            }
            return finish(doc);
        });
    }

    /** Conteo físico: por cada producto, la diferencia entre lo contado y el saldo actual se ajusta. */
    public DocumentView count(InventoryCommands.Count c, String idempotencyKey) {
        return idempotent(InventoryDocumentType.COUNT, idempotencyKey, () -> {
            requireActiveBranches(c.branchId());
            String reason = c.reason() == null || c.reason().isBlank() ? "Conteo físico" : c.reason().trim();
            List<Line> lines = requireLines(c.lines(), true);
            StockLedger.Session session = ledger.open(Set.of(c.branchId()), productIds(lines), Set.of());
            InventoryDocument doc = newDocument(InventoryDocumentType.COUNT, c.branchId(), null, reason, c.notes(),
                    idempotencyKey);
            int lineNo = 0;
            for (Line line : lines) {
                Resolved r = resolve(session.product(line.productId()), line);
                BigDecimal expected = line.expectedQuantity() == null
                        ? session.balance(c.branchId(), line.productId())
                        : line.expectedQuantity().setScale(4, RoundingMode.HALF_UP);
                BigDecimal difference = r.baseQuantity().subtract(expected);
                String direction = difference.signum() > 0 ? "IN" : difference.signum() < 0 ? "OUT" : null;
                persistLine(doc, ++lineNo, line, r, direction, session.averageCost(line.productId()), expected,
                        r.baseQuantity());
                if (difference.signum() != 0) {
                    session.post(c.branchId(), line.productId(),
                            difference.signum() > 0 ? MovementType.ADJUSTMENT_IN : MovementType.ADJUSTMENT_OUT,
                            difference, null, false, REFERENCE_TYPE, doc.getId(), reason);
                }
            }
            return finish(doc);
        });
    }

    // ------------------------------------------------------------------ infraestructura del caso de uso

    /**
     * Repetir la petición con la misma clave devuelve el documento ya creado, pero solo si es del mismo tipo y del
     * mismo usuario: una clave reutilizada para otra operación responde 409 en vez de mostrar un documento ajeno
     * como si fuera el resultado (QA INV-10).
     */
    private DocumentView idempotent(InventoryDocumentType type, String idempotencyKey, Supplier<UUID> create) {
        String key = normalizeKey(idempotencyKey);
        if (key != null) {
            Optional<UUID> existing = findByKey(key, type);
            if (existing.isPresent()) {
                return queries.document(existing.get());
            }
        }
        try {
            UUID id = tx.execute(status -> create.get());
            return queries.document(id);
        } catch (RuntimeException ex) {
            // Dos peticiones simultáneas con la misma clave: gana una (índice único) y la otra devuelve el
            // mismo documento. La violación puede llegar traducida o no según dónde ocurra el flush.
            if (key != null) {
                Optional<UUID> winner = findByKey(key, type);
                if (winner.isPresent()) {
                    return queries.document(winner.get());
                }
            }
            throw ex;
        }
    }

    private Optional<UUID> findByKey(String key, InventoryDocumentType type) {
        UUID actor = CurrentActor.userId().orElse(null);
        Optional<UUID> found = tx.execute(status -> documents.findByIdempotencyKey(key).map(d -> {
            if (d.getType() != type || !Objects.equals(d.getCreatedBy(), actor)) {
                throw new ConflictException("Esta Idempotency-Key ya se usó en otro documento de inventario.");
            }
            return d.getId();
        }));
        return found == null ? Optional.empty() : found;
    }

    private InventoryDocument newDocument(InventoryDocumentType type, UUID branchId, UUID targetBranchId, String reason,
                                          String notes, String idempotencyKey) {
        InventoryDocument doc = InventoryDocument.create(documents.nextNumber(), type, branchId, targetBranchId,
                reason, blankToNull(notes), normalizeKey(idempotencyKey), CurrentActor.userId().orElse(null));
        em.persist(doc);
        return doc;
    }

    private void persistLine(InventoryDocument doc, int lineNo, Line line, Resolved r, String direction,
                             BigDecimal unitCost, BigDecimal expected, BigDecimal counted) {
        em.persist(InventoryDocumentLine.of(doc.getId(), lineNo, line.productId(), r.unitId(), r.quantity(), r.factor(),
                r.baseQuantity(), direction, unitCost, expected, counted));
    }

    private UUID finish(InventoryDocument doc) {
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("type", doc.getType());
        after.put("number", doc.getNumber());
        after.put("branchId", doc.getBranchId());
        if (doc.getTargetBranchId() != null) {
            after.put("targetBranchId", doc.getTargetBranchId());
        }
        after.put("reason", doc.getReason());
        audit.log("INVENTORY_DOCUMENT_CREATED", "inventory_document", doc.getId(), null, after);
        return doc.getId();
    }

    private record Resolved(UUID unitId, BigDecimal quantity, BigDecimal factor, BigDecimal baseQuantity) {
    }

    /** Convierte la cantidad a unidad base y valida que la unidad sea del producto. */
    private static Resolved resolve(StockProduct product, Line line) {
        UUID unitId = line.unitId() == null ? product.baseUnitId() : line.unitId();
        BigDecimal factor = product.factors().get(unitId);
        if (factor == null) {
            throw new BusinessRuleException("La unidad indicada no es una presentación de " + product.name() + ".");
        }
        BigDecimal quantity = line.quantity().setScale(4, RoundingMode.HALF_UP);
        BigDecimal base = quantity.multiply(factor).setScale(4, RoundingMode.HALF_UP);
        if (base.signum() < 0 || (base.signum() == 0 && quantity.signum() > 0)
                || base.compareTo(MAX_BASE_QUANTITY) > 0) {
            // Cero por redondeo o más de lo que cabe en la columna: antes daba 500 (QA INV-8).
            throw new BusinessRuleException("La cantidad de " + product.name() + " no es válida.");
        }
        if (!product.baseUnitAllowsDecimals() && base.stripTrailingZeros().scale() > 0) {
            throw new BusinessRuleException(product.name() + " se maneja en unidades enteras de "
                    + product.baseUnitCode() + ".");
        }
        return new Resolved(unitId, quantity, factor, base);
    }

    /** Costo por unidad base a partir del costo por la unidad indicada. */
    private static BigDecimal baseCost(BigDecimal costPerUnit, BigDecimal factor) {
        if (costPerUnit.signum() < 0) {
            throw new BusinessRuleException("El costo no puede ser negativo.");
        }
        return costPerUnit.divide(factor, 2, RoundingMode.HALF_UP);
    }

    private static List<Line> requireLines(List<Line> lines, boolean allowZero) {
        if (lines == null || lines.isEmpty()) {
            throw new BusinessRuleException("El documento debe tener al menos una línea.");
        }
        if (lines.size() > MAX_LINES) {
            throw new BusinessRuleException("Máximo " + MAX_LINES + " líneas por documento.");
        }
        Set<UUID> seen = new HashSet<>();
        for (Line line : lines) {
            if (line.productId() == null || line.quantity() == null) {
                throw new BusinessRuleException("Cada línea necesita producto y cantidad.");
            }
            if (!seen.add(line.productId())) {
                throw new BusinessRuleException("Un producto aparece en dos líneas; únelas en una sola.");
            }
            int sign = line.quantity().signum();
            if (sign < 0 || (sign == 0 && !allowZero)) {
                throw new BusinessRuleException(allowZero
                        ? "La cantidad contada no puede ser negativa."
                        : "Las cantidades deben ser mayores que cero.");
            }
        }
        return lines;
    }

    private static Set<UUID> productIds(List<Line> lines) {
        Set<UUID> ids = new HashSet<>();
        lines.forEach(l -> ids.add(l.productId()));
        return ids;
    }

    private void requireActiveBranches(UUID... ids) {
        List<UUID> wanted = List.of(ids);
        List<BranchRef> found = branches.findByIds(wanted);
        if (found.size() != new HashSet<>(wanted).size() || found.stream().anyMatch(b -> !b.active())) {
            throw new BusinessRuleException("La sucursal no existe o está inactiva.");
        }
    }

    private static String requireReason(String reason) {
        if (reason == null || reason.isBlank()) {
            throw new BusinessRuleException("El motivo del ajuste es obligatorio.");
        }
        return reason.trim();
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
