package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.domain.Category;
import com.poshibrido.catalog.domain.PriceList;
import com.poshibrido.catalog.domain.PriceListItem;
import com.poshibrido.catalog.domain.PriceListItemId;
import com.poshibrido.catalog.domain.Product;
import com.poshibrido.catalog.domain.ProductBarcode;
import com.poshibrido.catalog.domain.ProductUnitConversion;
import com.poshibrido.catalog.domain.Tax;
import com.poshibrido.catalog.domain.Unit;
import com.poshibrido.catalog.infrastructure.CategoryRepository;
import com.poshibrido.catalog.infrastructure.PriceListItemRepository;
import com.poshibrido.catalog.infrastructure.PriceListRepository;
import com.poshibrido.catalog.infrastructure.ProductBarcodeRepository;
import com.poshibrido.catalog.infrastructure.ProductRepository;
import com.poshibrido.catalog.infrastructure.TaxRepository;
import com.poshibrido.catalog.infrastructure.UnitRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Productos: alta, edición completa (presentaciones, códigos de barras, precios por lista),
 * activación, búsqueda y generación de códigos internos.
 */
@Service
@RequiredArgsConstructor
public class ProductService {

    private static final UUID NO_CATEGORY = new UUID(0, 0);

    private final ProductRepository products;
    private final ProductBarcodeRepository barcodes;
    private final PriceListItemRepository listItems;
    private final CategoryRepository categories;
    private final UnitRepository units;
    private final TaxRepository taxes;
    private final PriceListRepository priceLists;
    private final AuditLogger audit;

    @Transactional(readOnly = true)
    public Page<ProductView> search(String search, UUID categoryId, boolean includeInactive, Pageable pageable) {
        String term = search == null ? "" : search.trim();
        String pattern = "%" + escapeLike(term.toLowerCase(Locale.ROOT)) + "%";
        Page<Product> page = products.search(pattern, pattern.toUpperCase(Locale.ROOT), term,
                categoryId == null, categoryId == null ? NO_CATEGORY : categoryId, includeInactive, pageable);
        References refs = references();
        return page.map(p -> toView(p, refs, List.of()));
    }

    @Transactional(readOnly = true)
    public ProductView get(UUID id) {
        Product product = find(id);
        return toView(product, references(), listItems.findByProduct(id));
    }

    @Transactional
    public ProductView create(ProductCommand command) {
        References refs = references();
        String sku = CatalogCodes.sku(command.sku());
        if (products.findBySkuIgnoreCase(sku).isPresent()) {
            throw new ConflictException("Ya existe un producto con el SKU " + sku + ".");
        }
        Product product = Product.create(validData(command, sku, refs));
        apply(product, command, refs);
        products.save(product);
        syncListPrices(product, command.listPrices(), refs);
        ProductView view = toView(product, refs, listItems.findByProduct(product.getId()));
        audit.log("PRODUCT_CREATED", "product", product.getId(), null, snapshot(view));
        return view;
    }

    @Transactional
    public ProductView update(UUID id, ProductCommand command) {
        References refs = references();
        Product product = find(id);
        Map<String, Object> before = snapshot(toView(product, refs, listItems.findByProduct(id)));
        String sku = CatalogCodes.sku(command.sku());
        products.findBySkuIgnoreCase(sku).filter(other -> !other.getId().equals(id)).ifPresent(other -> {
            throw new ConflictException("Ya existe otro producto con el SKU " + sku + ".");
        });
        product.apply(validData(command, sku, refs));
        apply(product, command, refs);
        syncListPrices(product, command.listPrices(), refs);
        ProductView view = toView(product, refs, listItems.findByProduct(id));
        audit.log("PRODUCT_UPDATED", "product", id, before, snapshot(view));
        return view;
    }

    @Transactional
    public ProductView setActive(UUID id, boolean active) {
        Product product = find(id);
        if (product.isActive() != active) {
            product.setActive(active);
            audit.log(active ? "PRODUCT_ACTIVATED" : "PRODUCT_DEACTIVATED", "product", id, null, null);
        }
        return toView(product, references(), listItems.findByProduct(id));
    }

    /** Siguiente código EAN-13 interno libre (prefijo 29). */
    @Transactional
    public String nextInternalBarcode() {
        for (int attempt = 0; attempt < 50; attempt++) {
            String code = Ean13.internal(barcodes.nextInternalSequence());
            if (!barcodes.existsByBarcode(code)) {
                return code;
            }
        }
        throw new ConflictException("No fue posible generar un código interno libre. Intenta de nuevo.");
    }

    Product find(UUID id) {
        return products.findById(id).orElseThrow(() -> new NotFoundException("Producto no encontrado."));
    }

    // ------------------------------------------------------------------ validación y aplicación

    private Product.Data validData(ProductCommand c, String sku, References refs) {
        if (c.categoryId() != null) {
            Category category = refs.categories().get(c.categoryId());
            if (category == null || !category.isActive()) {
                throw new BusinessRuleException("La categoría no existe o está inactiva.");
            }
        }
        requireActiveUnit(c.baseUnitId(), refs, "La unidad base");
        Tax tax = refs.taxes().get(c.taxId());
        if (tax == null || !tax.isActive()) {
            throw new BusinessRuleException("El impuesto no existe o está inactivo.");
        }
        return new Product.Data(sku, c.name().trim(), blankToNull(c.description()), c.categoryId(), c.baseUnitId(),
                c.taxId(), c.cost() == null ? BigDecimal.ZERO : c.cost(), c.salePrice(), c.trackInventory());
    }

    private void apply(Product product, ProductCommand c, References refs) {
        Set<UUID> conversionUnits = new HashSet<>();
        Set<Product.ConversionData> conversions = new HashSet<>();
        for (ProductCommand.Conversion conversion : nullSafe(c.conversions())) {
            requireActiveUnit(conversion.unitId(), refs, "La unidad de la presentación");
            if (conversion.unitId().equals(c.baseUnitId())) {
                throw new BusinessRuleException("Una presentación no puede usar la unidad base del producto.");
            }
            if (!conversionUnits.add(conversion.unitId())) {
                throw new BusinessRuleException("Hay dos presentaciones con la misma unidad.");
            }
            if (conversion.factor() == null || conversion.factor().signum() <= 0) {
                throw new BusinessRuleException("El factor de la presentación debe ser mayor que 0.");
            }
            conversions.add(new Product.ConversionData(conversion.unitId(), conversion.factor(), conversion.salePrice()));
        }

        Set<String> seen = new HashSet<>();
        Set<Product.BarcodeData> barcodeData = new HashSet<>();
        for (ProductCommand.Barcode barcode : nullSafe(c.barcodes())) {
            String code = CatalogCodes.barcode(barcode.barcode());
            if (!seen.add(code)) {
                throw new BusinessRuleException("El código " + code + " está repetido.");
            }
            if (barcode.unitId() != null && !barcode.unitId().equals(c.baseUnitId())
                    && !conversionUnits.contains(barcode.unitId())) {
                throw new BusinessRuleException("El código " + code + " apunta a una unidad que no es presentación del producto.");
            }
            barcodes.findByBarcode(code)
                    .filter(existing -> !existing.getProduct().getId().equals(product.getId()))
                    .ifPresent(existing -> {
                        throw new ConflictException("El código " + code + " ya pertenece al producto "
                                + existing.getProduct().getSku() + " — " + existing.getProduct().getName() + ".");
                    });
            UUID unitId = c.baseUnitId().equals(barcode.unitId()) ? null : barcode.unitId();
            barcodeData.add(new Product.BarcodeData(code, unitId, barcode.internal()));
        }

        product.replaceConversions(conversions);
        product.replaceBarcodes(barcodeData);
    }

    private void syncListPrices(Product product, List<ProductCommand.ListPrice> wanted, References refs) {
        Map<PriceListItemId, BigDecimal> target = new LinkedHashMap<>();
        for (ProductCommand.ListPrice lp : nullSafe(wanted)) {
            PriceList list = refs.priceLists().get(lp.priceListId());
            if (list == null || !list.isActive()) {
                throw new BusinessRuleException("La lista de precios no existe o está inactiva.");
            }
            if (list.isDefaultList()) {
                throw new BusinessRuleException("La lista General usa el precio del producto; no se le asignan precios aparte.");
            }
            UUID unitId = lp.unitId() == null ? product.getBaseUnitId() : lp.unitId();
            if (!unitId.equals(product.getBaseUnitId()) && product.conversionFor(unitId).isEmpty()) {
                throw new BusinessRuleException("Un precio de lista usa una unidad que no es del producto.");
            }
            if (lp.price() == null || lp.price().signum() < 0) {
                throw new BusinessRuleException("Los precios de lista no pueden ser negativos.");
            }
            if (target.put(new PriceListItemId(list.getId(), product.getId(), unitId), lp.price()) != null) {
                throw new BusinessRuleException("Hay dos precios para la misma lista y unidad.");
            }
        }
        List<PriceListItem> current = listItems.findByProduct(product.getId());
        for (PriceListItem item : current) {
            BigDecimal price = target.remove(item.getId());
            if (price == null) {
                listItems.delete(item);
            } else {
                item.changePrice(price.setScale(2, java.math.RoundingMode.HALF_UP));
            }
        }
        target.forEach((id, price) -> listItems.save(
                new PriceListItem(id, price.setScale(2, java.math.RoundingMode.HALF_UP))));
    }

    private static void requireActiveUnit(UUID unitId, References refs, String label) {
        Unit unit = unitId == null ? null : refs.units().get(unitId);
        if (unit == null || !unit.isActive()) {
            throw new BusinessRuleException(label + " no existe o está inactiva.");
        }
    }

    // ------------------------------------------------------------------ vistas

    record References(Map<UUID, Category> categories, Map<UUID, Unit> units, Map<UUID, Tax> taxes,
                      Map<UUID, PriceList> priceLists) {
    }

    References references() {
        return new References(
                categories.findAll().stream().collect(Collectors.toMap(Category::getId, Function.identity())),
                units.findAll().stream().collect(Collectors.toMap(Unit::getId, Function.identity())),
                taxes.findAll().stream().collect(Collectors.toMap(Tax::getId, Function.identity())),
                priceLists.findAll().stream().collect(Collectors.toMap(PriceList::getId, Function.identity())));
    }

    ProductView toView(Product p, References refs, List<PriceListItem> items) {
        Map<UUID, Unit> unitById = refs.units();
        Tax tax = refs.taxes().get(p.getTaxId());
        Category category = p.getCategoryId() == null ? null : refs.categories().get(p.getCategoryId());
        List<ProductView.ConversionView> conversions = p.getConversions().stream()
                .sorted(Comparator.comparing(ProductUnitConversion::getFactor))
                .map(c -> new ProductView.ConversionView(c.getUnitId(), code(unitById, c.getUnitId()), c.getFactor(),
                        c.getSalePrice(), p.generalPrice(c.getUnitId()).orElse(null)))
                .toList();
        List<ProductView.BarcodeView> barcodeViews = p.getBarcodes().stream()
                .sorted(Comparator.comparing(ProductBarcode::getBarcode))
                .map(b -> new ProductView.BarcodeView(b.getBarcode(), b.getUnitId(),
                        code(unitById, b.getUnitId() == null ? p.getBaseUnitId() : b.getUnitId()), b.isInternal()))
                .toList();
        List<ProductView.ListPriceView> listPrices = items.stream()
                .map(i -> {
                    PriceList list = refs.priceLists().get(i.getId().getPriceListId());
                    return new ProductView.ListPriceView(i.getId().getPriceListId(),
                            list == null ? null : list.getName(), i.getId().getUnitId(),
                            code(unitById, i.getId().getUnitId()), i.getPrice());
                })
                .sorted(Comparator.comparing(ProductView.ListPriceView::priceListName,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        return new ProductView(p.getId(), p.getSku(), p.getName(), p.getDescription(), p.getCategoryId(),
                category == null ? null : category.getName(), p.getBaseUnitId(), code(unitById, p.getBaseUnitId()),
                p.getTaxId(), tax == null ? null : tax.getCode(), tax == null ? null : tax.getType(),
                tax == null ? null : tax.getRate(), p.getCost(), p.getSalePrice(), p.isTrackInventory(),
                p.isTracksLots(), p.isActive(), conversions, barcodeViews, listPrices);
    }

    private static String code(Map<UUID, Unit> units, UUID id) {
        Unit unit = id == null ? null : units.get(id);
        return unit == null ? null : unit.getCode();
    }

    private static Map<String, Object> snapshot(ProductView v) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("sku", v.sku());
        data.put("name", v.name());
        data.put("categoryId", v.categoryId());
        data.put("baseUnit", v.baseUnitCode());
        data.put("tax", v.taxCode());
        data.put("cost", v.cost());
        data.put("salePrice", v.salePrice());
        data.put("trackInventory", v.trackInventory());
        data.put("barcodes", v.barcodes().stream().map(ProductView.BarcodeView::barcode).toList());
        Map<String, Object> conversions = new HashMap<>();
        v.conversions().forEach(c -> conversions.put(Objects.toString(c.unitCode()), c.factor()));
        data.put("conversions", conversions);
        data.put("listPrices", v.listPrices().size());
        return data;
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
