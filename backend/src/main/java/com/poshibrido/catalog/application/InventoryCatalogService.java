package com.poshibrido.catalog.application;

import com.poshibrido.catalog.domain.Product;
import com.poshibrido.catalog.domain.ProductUnitConversion;
import com.poshibrido.catalog.domain.Unit;
import com.poshibrido.catalog.infrastructure.ProductRepository;
import com.poshibrido.catalog.infrastructure.UnitRepository;
import com.poshibrido.shared.error.NotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class InventoryCatalogService implements InventoryCatalogApi {

    private static final UUID NO_CATEGORY = new UUID(0, 0);

    private final ProductRepository products;
    private final UnitRepository units;

    @PersistenceContext
    private EntityManager em;

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, StockProduct> stockProducts(Collection<UUID> productIds) {
        if (productIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Unit> unitById = unitMap();
        return products.findAllById(productIds).stream()
                .collect(Collectors.toMap(Product::getId, p -> toStockProduct(p, unitById)));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public LockedProducts loadForInventory(Collection<UUID> productIds, Collection<UUID> costProductIds) {
        if (productIds.isEmpty()) {
            return new LockedProducts(Map.of(), Set.of());
        }
        Set<UUID> toLock = new TreeSet<>(costProductIds);
        toLock.retainAll(productIds);
        toLock.addAll(products.findIdsWithUnlockedCost(productIds));
        Set<UUID> locked = toLock.isEmpty() ? Set.of() : Set.copyOf(products.lockIds(toLock));
        Map<UUID, Unit> unitById = unitMap();
        Map<UUID, StockProduct> result = new LinkedHashMap<>();
        for (Product p : products.findAllById(productIds)) {
            if (locked.contains(p.getId())) {
                // Puede venir del contexto de persistencia: se relee ya con la fila bloqueada.
                em.refresh(p);
            }
            result.put(p.getId(), toStockProduct(p, unitById));
        }
        return new LockedProducts(result, locked);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void setAverageCost(UUID productId, BigDecimal averageCost) {
        find(productId).applyAverageCost(averageCost);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockCost(UUID productId) {
        Product product = find(productId);
        if (!product.isCostLocked()) {
            product.lockCost();
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Page<StockProduct> searchTracked(String search, UUID categoryId, Pageable pageable) {
        String term = search == null ? "" : search.trim();
        String pattern = "%" + ProductService.escapeLike(term.toLowerCase(Locale.ROOT)) + "%";
        Map<UUID, Unit> unitById = unitMap();
        return products.searchTracked(pattern, pattern.toUpperCase(Locale.ROOT), term, categoryId == null,
                        categoryId == null ? NO_CATEGORY : categoryId, pageable)
                .map(p -> toStockProduct(p, unitById));
    }

    private Product find(UUID id) {
        return products.findById(id).orElseThrow(() -> new NotFoundException("Producto no encontrado."));
    }

    private Map<UUID, Unit> unitMap() {
        return units.findAll().stream().collect(Collectors.toMap(Unit::getId, Function.identity()));
    }

    private static StockProduct toStockProduct(Product p, Map<UUID, Unit> unitById) {
        Map<UUID, BigDecimal> factors = new LinkedHashMap<>();
        Map<UUID, String> codes = new LinkedHashMap<>();
        factors.put(p.getBaseUnitId(), BigDecimal.ONE);
        codes.put(p.getBaseUnitId(), code(unitById, p.getBaseUnitId()));
        for (ProductUnitConversion c : p.getConversions()) {
            factors.put(c.getUnitId(), c.getFactor());
            codes.put(c.getUnitId(), code(unitById, c.getUnitId()));
        }
        Unit base = unitById.get(p.getBaseUnitId());
        return new StockProduct(p.getId(), p.getSku(), p.getName(), p.isActive(), p.isTrackInventory(),
                p.getBaseUnitId(), code(unitById, p.getBaseUnitId()), base != null && base.isAllowsDecimals(),
                p.getCost(), Map.copyOf(factors), Map.copyOf(codes));
    }

    private static String code(Map<UUID, Unit> unitById, UUID id) {
        Unit unit = unitById.get(id);
        return unit == null ? "" : unit.getCode();
    }
}
