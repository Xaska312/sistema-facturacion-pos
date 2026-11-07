package com.poshibrido.catalog.application;

import com.poshibrido.catalog.application.ProductModelService.ModelCommand;
import com.poshibrido.catalog.application.ProductModelService.ModelView;
import com.poshibrido.catalog.application.ProductModelService.VariantView;
import com.poshibrido.catalog.domain.Category;
import com.poshibrido.catalog.domain.ProductModel;
import com.poshibrido.catalog.domain.Tax;
import com.poshibrido.catalog.domain.Unit;
import com.poshibrido.catalog.infrastructure.CategoryRepository;
import com.poshibrido.catalog.infrastructure.ProductModelRepository;
import com.poshibrido.catalog.infrastructure.TaxRepository;
import com.poshibrido.catalog.infrastructure.UnitRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Crear desde la factura lo que falta (decisión 301): en Recibir mercancía, las líneas de la factura que no están en
 * XASKA se crean todas de una vez, como producto simple o como modelo con tallas (y un color), y se devuelven los
 * productos con su cantidad para ponerlos en la recepción. Todo o nada. Si ya hay un modelo con ese prefijo, se le
 * agregan las tallas que falten (otra curva de la misma referencia).
 */
@Service
@RequiredArgsConstructor
public class InvoiceProductsService {

    static final int MAX_ITEMS = 200;

    private final ProductService products;
    private final ProductModelService models;
    private final ProductModelRepository modelRepository;
    private final CategoryRepository categories;
    private final TaxRepository taxes;
    private final UnitRepository units;

    public record SizeQuantity(String size, BigDecimal quantity) {
    }

    /**
     * Una línea por crear. Simple: {@code sku}, {@code unitCode}, {@code barcode}. Con tallas: {@code sku} es el prefijo
     * del modelo, {@code sizeScaleId}, {@code sizes} (cada talla con lo que llegó) y {@code color} opcional.
     */
    public record Item(int lineNo, String sku, String name, String category, String unitCode, String taxCode,
                       BigDecimal cost, BigDecimal price, String barcode, UUID sizeScaleId, String color,
                       List<SizeQuantity> sizes) {

        boolean withSizes() {
            return sizes != null && !sizes.isEmpty();
        }
    }

    public record Created(UUID productId, String sku, String name, UUID unitId, String size, BigDecimal quantity) {
    }

    public record CreatedLine(int lineNo, List<Created> products) {
    }

    @Transactional
    public List<CreatedLine> create(List<Item> items, boolean variantsEnabled) {
        if (items == null || items.isEmpty()) {
            throw new BusinessRuleException("No hay productos por crear.");
        }
        if (items.size() > MAX_ITEMS) {
            throw new BusinessRuleException("Máximo " + MAX_ITEMS + " productos por vez.");
        }
        Map<String, UUID> categoryIds = new HashMap<>();
        List<CreatedLine> result = new ArrayList<>();
        for (Item item : items) {
            String where = "«" + (item.name() == null ? "Línea " + item.lineNo() : item.name().trim()) + "»: ";
            try {
                UUID categoryId = category(item.category(), categoryIds);
                Tax tax = taxes.findByCode(nz(item.taxCode())).filter(Tax::isActive)
                        .orElseThrow(() -> new BusinessRuleException("elige el impuesto."));
                if (item.withSizes()) {
                    if (!variantsEnabled) {
                        throw new BusinessRuleException("las tallas necesitan el módulo de productos con tallas.");
                    }
                    result.add(new CreatedLine(item.lineNo(), withSizes(item, categoryId, tax.getId())));
                } else {
                    result.add(new CreatedLine(item.lineNo(), List.of(simple(item, categoryId, tax.getId()))));
                }
            } catch (BusinessRuleException ex) {
                throw new BusinessRuleException(where + lowerFirst(ex.getMessage()));
            }
        }
        return result;
    }

    private Created simple(Item item, UUID categoryId, UUID taxId) {
        Unit unit = units.findByCode(nz(item.unitCode()).toUpperCase(Locale.ROOT)).filter(Unit::isActive)
                .orElseThrow(() -> new BusinessRuleException("elige la unidad."));
        String barcode = item.barcode() == null ? "" : item.barcode().replaceAll("\\D", "");
        List<ProductCommand.Barcode> barcodes = barcode.length() >= 8 && barcode.length() <= 14
                ? List.of(new ProductCommand.Barcode(barcode, unit.getId(), false)) : List.of();
        ProductView p = products.create(new ProductCommand(item.sku(), item.name(), null, categoryId, unit.getId(), taxId,
                money(item.cost()), money(item.price()), true, false, List.of(), barcodes, List.of()));
        return new Created(p.id(), p.sku(), p.name(), unit.getId(), null, null);
    }

    private List<Created> withSizes(Item item, UUID categoryId, UUID taxId) {
        List<String> sizes = new ArrayList<>(new LinkedHashSet<>(item.sizes().stream()
                .filter(s -> s.quantity() != null && s.quantity().signum() > 0)
                .map(s -> s.size() == null ? "" : s.size().trim()).toList()));
        if (sizes.isEmpty()) {
            throw new BusinessRuleException("pon cuántos llegaron de cada talla.");
        }
        if (item.sizeScaleId() == null) {
            throw new BusinessRuleException("elige la escala de tallas.");
        }
        String color = item.color() == null || item.color().isBlank() ? null : item.color().trim();
        List<String> colors = color == null ? List.of() : List.of(color);
        ProductModel existing = modelRepository.findBySkuPrefixIgnoreCase(nz(item.sku()).toUpperCase(Locale.ROOT))
                .orElse(null);
        ModelView view;
        if (existing == null) {
            view = models.create(new ModelCommand(item.sku(), item.name(), null, categoryId, taxId, money(item.cost()),
                    money(item.price()), item.sizeScaleId(), sizes, colors));
        } else {
            // Otra curva de una referencia que ya existe: se agregan solo las tallas (o el color) que falten.
            if (!existing.getSizeScaleId().equals(item.sizeScaleId())) {
                throw new BusinessRuleException("ya existe el modelo " + existing.getSkuPrefix()
                        + " con otra escala de tallas: usa otro prefijo.");
            }
            view = models.get(existing.getId());
            List<String> missing = sizes.stream().filter(s -> find(models.get(existing.getId()), s, color) == null)
                    .toList();
            if (!missing.isEmpty()) {
                view = models.addVariants(existing.getId(), missing, colors);
            }
        }
        List<Created> created = new ArrayList<>();
        for (SizeQuantity sq : item.sizes()) {
            if (sq.quantity() == null || sq.quantity().signum() <= 0) {
                continue;
            }
            VariantView v = find(view, sq.size().trim(), color);
            if (v == null) {
                throw new BusinessRuleException("no se encontró la talla " + sq.size() + ".");
            }
            created.add(new Created(v.productId(), v.sku(), v.name(), v.baseUnitId(), v.size(), sq.quantity()));
        }
        return created;
    }

    private static VariantView find(ModelView view, String size, String color) {
        return view.variants().stream()
                .filter(v -> v.size() != null && v.size().equalsIgnoreCase(size))
                .filter(v -> color == null ? v.color() == null : color.equalsIgnoreCase(v.color()))
                .findFirst().orElse(null);
    }

    private UUID category(String raw, Map<String, UUID> cache) {
        String name = raw == null ? "" : raw.trim();
        if (name.isEmpty()) {
            return null;
        }
        if (name.length() > 60) {
            throw new BusinessRuleException("la categoría puede tener hasta 60 letras.");
        }
        return cache.computeIfAbsent(name.toLowerCase(Locale.ROOT), k -> categories.findByNameIgnoreCase(name)
                .stream().filter(Category::isActive).map(Category::getId).filter(Objects::nonNull).findFirst()
                .orElseGet(() -> categories.save(Category.create(name, null)).getId()));
    }

    private static BigDecimal money(BigDecimal v) {
        if (v == null || v.signum() < 0) {
            throw new BusinessRuleException("revisa el costo y el precio.");
        }
        return v;
    }

    private static String nz(String s) {
        return s == null ? "" : s.trim();
    }

    private static String lowerFirst(String s) {
        return s == null || s.isEmpty() ? "" : Character.toLowerCase(s.charAt(0)) + s.substring(1);
    }
}
