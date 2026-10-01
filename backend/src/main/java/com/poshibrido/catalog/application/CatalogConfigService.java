package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.domain.Category;
import com.poshibrido.catalog.domain.PriceList;
import com.poshibrido.catalog.domain.Tax;
import com.poshibrido.catalog.domain.TaxType;
import com.poshibrido.catalog.domain.Unit;
import com.poshibrido.catalog.infrastructure.CategoryRepository;
import com.poshibrido.catalog.infrastructure.PriceListRepository;
import com.poshibrido.catalog.infrastructure.ProductRepository;
import com.poshibrido.catalog.infrastructure.TaxRepository;
import com.poshibrido.catalog.infrastructure.UnitRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Configuración del catálogo: categorías (árbol), unidades, impuestos y listas de precios.
 * Nada se borra: se desactiva (y no se puede desactivar lo que usan productos activos).
 */
@Service
@RequiredArgsConstructor
public class CatalogConfigService implements PriceListApi {

    private final CategoryRepository categories;
    private final UnitRepository units;
    private final TaxRepository taxes;
    private final PriceListRepository priceLists;
    private final ProductRepository products;
    private final AuditLogger audit;

    // ------------------------------------------------------------------ Categorías

    @Transactional(readOnly = true)
    public List<Category> categories() {
        return categories.findAll(Sort.by("name"));
    }

    @Transactional
    public Category createCategory(String name, UUID parentId) {
        requireActiveParent(parentId);
        requireUniqueSiblingName(null, name, parentId);
        Category category = categories.save(Category.create(name.trim(), parentId));
        audit.log("CATEGORY_CREATED", "category", category.getId(), null, Map.of("name", category.getName()));
        return category;
    }

    @Transactional
    public Category updateCategory(UUID id, String name, UUID parentId) {
        Category category = category(id);
        if (parentId != null) {
            requireActiveParent(parentId);
            if (createsCycle(id, parentId)) {
                throw new BusinessRuleException("Una categoría no puede quedar dentro de sí misma ni de sus subcategorías.");
            }
        }
        requireUniqueSiblingName(id, name, parentId);
        category.update(name.trim(), parentId);
        audit.log("CATEGORY_UPDATED", "category", id, null, Map.of("name", category.getName()));
        return category;
    }

    @Transactional
    public Category setCategoryActive(UUID id, boolean active) {
        Category category = category(id);
        if (!active && products.countByCategoryIdAndActiveTrue(id) > 0) {
            throw new ConflictException("La categoría tiene productos activos. Muévelos o desactívalos primero.");
        }
        category.setActive(active);
        audit.log(active ? "CATEGORY_ACTIVATED" : "CATEGORY_DEACTIVATED", "category", id, null, null);
        return category;
    }

    public Category category(UUID id) {
        return categories.findById(id).orElseThrow(() -> new NotFoundException("Categoría no encontrada."));
    }

    private void requireActiveParent(UUID parentId) {
        if (parentId != null && !categories.findById(parentId).map(Category::isActive).orElse(false)) {
            throw new BusinessRuleException("La categoría padre no existe o está inactiva.");
        }
    }

    private void requireUniqueSiblingName(UUID selfId, String name, UUID parentId) {
        boolean taken = categories.findByNameIgnoreCase(name.trim()).stream()
                .anyMatch(c -> !c.getId().equals(selfId) && java.util.Objects.equals(c.getParentId(), parentId));
        if (taken) {
            throw new ConflictException("Ya existe una categoría llamada '" + name.trim() + "' en ese nivel.");
        }
    }

    private boolean createsCycle(UUID id, UUID newParentId) {
        Map<UUID, Category> all = categories.findAll().stream()
                .collect(Collectors.toMap(Category::getId, Function.identity()));
        UUID current = newParentId;
        int guard = 0;
        while (current != null && guard++ < 1000) {
            if (current.equals(id)) {
                return true;
            }
            Category parent = all.get(current);
            current = parent == null ? null : parent.getParentId();
        }
        return false;
    }

    // ------------------------------------------------------------------ Unidades

    @Transactional(readOnly = true)
    public List<Unit> units() {
        return units.findAll(Sort.by("code"));
    }

    @Transactional
    public Unit createUnit(String rawCode, String name, boolean allowsDecimals) {
        String code = CatalogCodes.code(rawCode);
        if (!code.matches("^[A-Z0-9]{1,10}$")) {
            throw new BusinessRuleException("El código de unidad debe tener de 1 a 10 letras o números.");
        }
        if (units.existsByCode(code)) {
            throw new ConflictException("Ya existe la unidad " + code + ".");
        }
        Unit unit = units.save(Unit.create(code, name.trim(), allowsDecimals));
        audit.log("UNIT_CREATED", "unit", unit.getId(), null, Map.of("code", code, "name", unit.getName()));
        return unit;
    }

    @Transactional
    public Unit updateUnit(UUID id, String name, boolean allowsDecimals) {
        Unit unit = unit(id);
        unit.update(name.trim(), allowsDecimals);
        audit.log("UNIT_UPDATED", "unit", id, null, Map.of("name", unit.getName(), "allowsDecimals", allowsDecimals));
        return unit;
    }

    @Transactional
    public Unit setUnitActive(UUID id, boolean active) {
        Unit unit = unit(id);
        if (!active && products.countActiveUsingUnit(id) > 0) {
            throw new ConflictException("La unidad la usan productos activos.");
        }
        unit.setActive(active);
        audit.log(active ? "UNIT_ACTIVATED" : "UNIT_DEACTIVATED", "unit", id, null, null);
        return unit;
    }

    public Unit unit(UUID id) {
        return units.findById(id).orElseThrow(() -> new NotFoundException("Unidad no encontrada."));
    }

    // ------------------------------------------------------------------ Impuestos

    @Transactional(readOnly = true)
    public List<Tax> taxes() {
        return taxes.findAll(Sort.by("code"));
    }

    @Transactional
    public Tax createTax(String rawCode, String name, TaxType type, BigDecimal rate) {
        String code = CatalogCodes.code(rawCode);
        if (!code.matches("^[A-Z0-9_]{1,20}$")) {
            throw new BusinessRuleException("El código del impuesto debe tener de 1 a 20 letras, números o '_'.");
        }
        if (taxes.existsByCode(code)) {
            throw new ConflictException("Ya existe el impuesto " + code + ".");
        }
        BigDecimal validRate = validRate(type, rate);
        Tax tax = taxes.save(Tax.create(code, name.trim(), type, validRate));
        audit.log("TAX_CREATED", "tax", tax.getId(), null,
                Map.of("code", code, "type", type, "rate", validRate));
        return tax;
    }

    @Transactional
    public Tax updateTax(UUID id, String name, BigDecimal rate) {
        Tax tax = tax(id);
        BigDecimal before = tax.getRate();
        BigDecimal validRate = validRate(tax.getType(), rate);
        tax.update(name.trim(), validRate);
        audit.log("TAX_UPDATED", "tax", id, Map.of("rate", before), Map.of("name", tax.getName(), "rate", validRate));
        return tax;
    }

    @Transactional
    public Tax setTaxActive(UUID id, boolean active) {
        Tax tax = tax(id);
        if (!active && products.countByTaxIdAndActiveTrue(id) > 0) {
            throw new ConflictException("El impuesto lo usan productos activos.");
        }
        tax.setActive(active);
        audit.log(active ? "TAX_ACTIVATED" : "TAX_DEACTIVATED", "tax", id, null, null);
        return tax;
    }

    public Tax tax(UUID id) {
        return taxes.findById(id).orElseThrow(() -> new NotFoundException("Impuesto no encontrado."));
    }

    private static BigDecimal validRate(TaxType type, BigDecimal rate) {
        if (rate == null || rate.signum() < 0 || rate.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new BusinessRuleException("La tarifa debe estar entre 0 y 100.");
        }
        if (type.requiresZeroRate() && rate.signum() != 0) {
            throw new BusinessRuleException("Los impuestos exentos o excluidos tienen tarifa 0.");
        }
        if (!type.requiresZeroRate() && rate.signum() == 0) {
            throw new BusinessRuleException("Para tarifa 0 usa un impuesto de tipo Exento o Excluido.");
        }
        return rate.setScale(2, RoundingMode.HALF_UP);
    }

    // ------------------------------------------------------------------ Listas de precios

    @Transactional(readOnly = true)
    public List<PriceList> priceLists() {
        return priceLists.findAll(Sort.by(Sort.Order.desc("defaultList"), Sort.Order.asc("name")));
    }

    @Transactional
    public PriceList createPriceList(String rawCode, String name) {
        String code = CatalogCodes.code(rawCode);
        if (!code.matches("^[A-Z0-9_]{2,20}$")) {
            throw new BusinessRuleException("El código de la lista debe tener de 2 a 20 letras, números o '_'.");
        }
        if (priceLists.existsByCode(code)) {
            throw new ConflictException("Ya existe la lista " + code + ".");
        }
        PriceList list = priceLists.save(PriceList.create(code, name.trim()));
        audit.log("PRICE_LIST_CREATED", "price_list", list.getId(), null, Map.of("code", code, "name", list.getName()));
        return list;
    }

    @Transactional
    public PriceList renamePriceList(UUID id, String name) {
        PriceList list = priceList(id);
        list.rename(name.trim());
        audit.log("PRICE_LIST_UPDATED", "price_list", id, null, Map.of("name", list.getName()));
        return list;
    }

    @Transactional
    public PriceList setPriceListActive(UUID id, boolean active) {
        PriceList list = priceList(id);
        if (!active && list.isDefaultList()) {
            throw new BusinessRuleException("La lista General no se puede desactivar.");
        }
        list.setActive(active);
        audit.log(active ? "PRICE_LIST_ACTIVATED" : "PRICE_LIST_DEACTIVATED", "price_list", id, null, null);
        return list;
    }

    @Override
    @Transactional(readOnly = true)
    public java.util.Optional<PriceListRef> find(UUID id) {
        return id == null ? java.util.Optional.empty() : priceLists.findById(id).map(CatalogConfigService::ref);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, PriceListRef> all() {
        return priceLists.findAll().stream().collect(Collectors.toMap(PriceList::getId, CatalogConfigService::ref));
    }

    private static PriceListRef ref(PriceList p) {
        return new PriceListRef(p.getId(), p.getCode(), p.getName(), p.isDefaultList(), p.isActive());
    }

    public PriceList priceList(UUID id) {
        return priceLists.findById(id).orElseThrow(() -> new NotFoundException("Lista de precios no encontrada."));
    }
}
