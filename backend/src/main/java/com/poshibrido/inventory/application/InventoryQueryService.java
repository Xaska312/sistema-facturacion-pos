package com.poshibrido.inventory.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.application.InventoryCatalogApi;
import com.poshibrido.catalog.application.InventoryCatalogApi.StockProduct;
import com.poshibrido.inventory.application.InventoryViews.AlertRow;
import com.poshibrido.inventory.application.InventoryViews.DocumentLineView;
import com.poshibrido.inventory.application.InventoryViews.DocumentView;
import com.poshibrido.inventory.application.InventoryViews.KardexRow;
import com.poshibrido.inventory.application.InventoryViews.StockRow;
import com.poshibrido.inventory.application.InventoryViews.StockStatus;
import com.poshibrido.inventory.domain.InventoryDocument;
import com.poshibrido.inventory.domain.InventoryDocumentLine;
import com.poshibrido.inventory.domain.InventoryDocumentType;
import com.poshibrido.inventory.domain.StockBalance;
import com.poshibrido.inventory.domain.StockMovement;
import com.poshibrido.inventory.infrastructure.InventoryConsistencyQueries;
import com.poshibrido.inventory.infrastructure.InventoryDocumentLineRepository;
import com.poshibrido.inventory.infrastructure.InventoryDocumentRepository;
import com.poshibrido.inventory.infrastructure.StockBalanceRepository;
import com.poshibrido.inventory.infrastructure.StockMovementRepository;
import com.poshibrido.organization.application.BranchApi;
import com.poshibrido.organization.application.BranchApi.BranchRef;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Consultas del inventario: existencias, alertas, kardex, documentos y niveles mínimo/máximo. */
@Service
@RequiredArgsConstructor
public class InventoryQueryService {

    private static final int MAX_ALERTS = 500;
    private static final Instant FAR_FUTURE = Instant.parse("9999-12-31T00:00:00Z");

    private final StockBalanceRepository balances;
    private final StockMovementRepository movements;
    private final InventoryDocumentRepository documents;
    private final InventoryDocumentLineRepository lines;
    private final InventoryConsistencyQueries consistency;
    private final InventoryCatalogApi catalog;
    private final BranchApi branches;
    private final MemberDirectory members;
    private final AuditLogger audit;

    @Transactional(readOnly = true)
    public Page<StockRow> stock(UUID branchId, String search, UUID categoryId, Pageable pageable) {
        requireBranch(branchId);
        Page<StockProduct> page = catalog.searchTracked(search, categoryId, pageable);
        Map<UUID, StockBalance> byProduct = page.isEmpty() ? Map.of()
                : balances.findForBranch(branchId, page.getContent().stream().map(StockProduct::id).toList()).stream()
                .collect(Collectors.toMap(StockBalance::getProductId, Function.identity()));
        return page.map(p -> row(branchId, p, byProduct.get(p.id())));
    }

    @Transactional(readOnly = true)
    public StockRow balance(UUID branchId, UUID productId) {
        requireBranch(branchId);
        StockProduct product = catalog.stockProducts(List.of(productId)).get(productId);
        if (product == null) {
            throw new NotFoundException("Producto no encontrado.");
        }
        return row(branchId, product, balances.find(branchId, productId).orElse(null));
    }

    @Transactional(readOnly = true)
    public List<AlertRow> alerts(UUID branchId) {
        List<StockBalance> low = balances.belowMinimum(branchId == null, branchId == null ? new UUID(0, 0) : branchId);
        if (low.size() > MAX_ALERTS) {
            low = low.subList(0, MAX_ALERTS);
        }
        Map<UUID, StockProduct> products = catalog.stockProducts(low.stream().map(StockBalance::getProductId).toList());
        Map<UUID, BranchRef> branchById = branchMap(low.stream().map(StockBalance::getBranchId).toList());
        return low.stream()
                .filter(b -> products.containsKey(b.getProductId()))
                .filter(b -> products.get(b.getProductId()).active() && products.get(b.getProductId()).trackInventory())
                .map(b -> {
                    StockProduct p = products.get(b.getProductId());
                    BranchRef branch = branchById.get(b.getBranchId());
                    return new AlertRow(b.getBranchId(), branch == null ? null : branch.name(), p.id(), p.sku(),
                            p.name(), p.baseUnitCode(), b.getQuantity(), b.getMinStock());
                })
                .toList();
    }

    @Transactional
    public StockRow setLevels(UUID branchId, UUID productId, BigDecimal minStock, BigDecimal maxStock) {
        requireBranch(branchId);
        StockProduct product = catalog.stockProducts(List.of(productId)).get(productId);
        if (product == null) {
            throw new NotFoundException("Producto no encontrado.");
        }
        if (!product.trackInventory()) {
            throw new BusinessRuleException("El producto " + product.name() + " no controla inventario.");
        }
        if (minStock != null && maxStock != null && maxStock.compareTo(minStock) < 0) {
            throw new BusinessRuleException("El máximo no puede ser menor que el mínimo.");
        }
        balances.ensureExists(StockBalance.newId(), branchId, productId);
        StockBalance balance = balances.find(branchId, productId).orElseThrow();
        balance.setLevels(scale(minStock), scale(maxStock));
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("branchId", branchId);
        after.put("minStock", minStock);
        after.put("maxStock", maxStock);
        audit.log("STOCK_LEVELS_UPDATED", "product", productId, null, after);
        return row(branchId, product, balance);
    }

    @Transactional(readOnly = true)
    public Page<KardexRow> kardex(UUID productId, UUID branchId, Instant from, Instant to, int page, int size) {
        if (catalog.stockProducts(List.of(productId)).isEmpty()) {
            throw new NotFoundException("Producto no encontrado.");
        }
        Page<StockMovement> result = movements.kardex(productId, branchId == null,
                branchId == null ? new UUID(0, 0) : branchId, from == null ? Instant.EPOCH : from,
                to == null ? FAR_FUTURE : to, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200)));
        List<StockMovement> content = result.getContent();
        Map<UUID, BranchRef> branchById = branchMap(content.stream().map(StockMovement::getBranchId).toList());
        Map<UUID, String> names = members.displayNames(content.stream().map(StockMovement::getCreatedBy).toList());
        Map<UUID, Long> numbers = documents.findAllById(content.stream()
                        .filter(m -> InventoryDocumentService.REFERENCE_TYPE.equals(m.getReferenceType()))
                        .map(StockMovement::getReferenceId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(InventoryDocument::getId, InventoryDocument::getNumber));
        return result.map(m -> new KardexRow(m.getEntryNo() == null ? 0 : m.getEntryNo(), m.getCreatedAt(),
                m.getBranchId(), branchById.containsKey(m.getBranchId()) ? branchById.get(m.getBranchId()).name() : null,
                m.getType(), m.getQuantity(), m.getUnitCost(), m.getBalanceAfter(), m.getReferenceType(),
                m.getReferenceId(), numbers.get(m.getReferenceId()), m.getReason(), names.get(m.getCreatedBy())));
    }

    @Transactional(readOnly = true)
    public Page<DocumentView> documents(InventoryDocumentType type, UUID branchId, int page, int size) {
        Page<InventoryDocument> result = documents.search(type == null, type == null ? InventoryDocumentType.ADJUSTMENT : type,
                branchId == null, branchId == null ? new UUID(0, 0) : branchId,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)));
        Collection<UUID> branchIds = new HashSet<>();
        result.forEach(d -> {
            branchIds.add(d.getBranchId());
            if (d.getTargetBranchId() != null) {
                branchIds.add(d.getTargetBranchId());
            }
        });
        Map<UUID, BranchRef> branchById = branchMap(branchIds);
        Map<UUID, String> names = members.displayNames(result.getContent().stream().map(InventoryDocument::getCreatedBy).toList());
        return result.map(d -> view(d, branchById, names, null));
    }

    @Transactional(readOnly = true)
    public DocumentView document(UUID id) {
        InventoryDocument d = documents.findById(id).orElseThrow(() -> new NotFoundException("Documento no encontrado."));
        Set<UUID> branchIds = new HashSet<>();
        branchIds.add(d.getBranchId());
        if (d.getTargetBranchId() != null) {
            branchIds.add(d.getTargetBranchId());
        }
        List<InventoryDocumentLine> docLines = lines.findByDocumentIdOrderByLineNo(id);
        Map<UUID, StockProduct> products = catalog.stockProducts(
                docLines.stream().map(InventoryDocumentLine::getProductId).collect(Collectors.toSet()));
        List<DocumentLineView> lineViews = docLines.stream().map(l -> {
            StockProduct p = products.get(l.getProductId());
            BigDecimal difference = l.getExpectedQuantity() == null ? null
                    : l.getCountedQuantity().subtract(l.getExpectedQuantity());
            return new DocumentLineView(l.getLineNo(), l.getProductId(), p == null ? null : p.sku(),
                    p == null ? null : p.name(), l.getUnitId(), p == null ? null : p.units().get(l.getUnitId()),
                    l.getQuantity(), l.getFactor(), l.getBaseQuantity(), l.getDirection(), l.getUnitCost(),
                    l.getExpectedQuantity(), l.getCountedQuantity(), difference);
        }).toList();
        return view(d, branchMap(branchIds), members.displayNames(java.util.Collections.singleton(d.getCreatedBy())),
                lineViews);
    }

    @Transactional(readOnly = true)
    public List<InventoryConsistencyQueries.Mismatch> consistency() {
        return consistency.mismatches();
    }

    // ------------------------------------------------------------------ apoyo

    private static DocumentView view(InventoryDocument d, Map<UUID, BranchRef> branchById, Map<UUID, String> names,
                                     List<DocumentLineView> lineViews) {
        BranchRef from = branchById.get(d.getBranchId());
        BranchRef to = d.getTargetBranchId() == null ? null : branchById.get(d.getTargetBranchId());
        return new DocumentView(d.getId(), d.getNumber(), d.getType(), d.getBranchId(), from == null ? null : from.name(),
                d.getTargetBranchId(), to == null ? null : to.name(), d.getReason(), d.getNotes(), d.getCreatedBy(),
                names.get(d.getCreatedBy()), d.getCreatedAt(), lineViews == null ? 0 : lineViews.size(),
                lineViews == null ? List.of() : lineViews);
    }

    private static StockRow row(UUID branchId, StockProduct p, StockBalance b) {
        BigDecimal quantity = b == null ? BigDecimal.ZERO.setScale(4) : b.getQuantity();
        BigDecimal min = b == null ? null : b.getMinStock();
        BigDecimal max = b == null ? null : b.getMaxStock();
        StockStatus status = min != null && quantity.compareTo(min) <= 0 ? StockStatus.LOW
                : max != null && quantity.compareTo(max) > 0 ? StockStatus.OVER : StockStatus.OK;
        BigDecimal value = quantity.multiply(p.cost()).setScale(2, RoundingMode.HALF_UP);
        return new StockRow(branchId, p.id(), p.sku(), p.name(), p.baseUnitCode(), quantity, min, max, status,
                p.cost(), value);
    }

    private void requireBranch(UUID branchId) {
        if (branchId == null || branches.findByIds(List.of(branchId)).isEmpty()) {
            throw new NotFoundException("Sucursal no encontrada.");
        }
    }

    private Map<UUID, BranchRef> branchMap(Collection<UUID> ids) {
        Set<UUID> unique = new HashSet<>(ids);
        return unique.isEmpty() ? Map.of() : branches.findByIds(unique).stream()
                .collect(Collectors.toMap(BranchRef::id, Function.identity()));
    }

    private static BigDecimal scale(BigDecimal value) {
        if (value == null) {
            return null;
        }
        if (value.signum() < 0) {
            throw new BusinessRuleException("Los niveles de existencia no pueden ser negativos.");
        }
        return value.setScale(4, RoundingMode.HALF_UP);
    }
}
