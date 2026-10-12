package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.application.SizeScaleService.Size;
import com.poshibrido.catalog.domain.Category;
import com.poshibrido.catalog.domain.Product;
import com.poshibrido.catalog.domain.ProductBarcode;
import com.poshibrido.catalog.domain.ProductModel;
import com.poshibrido.catalog.domain.SizeScale;
import com.poshibrido.catalog.domain.Tax;
import com.poshibrido.catalog.domain.Unit;
import com.poshibrido.catalog.infrastructure.CategoryRepository;
import com.poshibrido.catalog.infrastructure.ProductBarcodeRepository;
import com.poshibrido.catalog.infrastructure.ProductModelRepository;
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
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Modelos con tallas y colores (fase 8d). Crear un modelo crea una variante por cada talla × color: un producto normal
 * (SKU {@code PREFIJO-TALLA-COLOR}, código de barras interno, unidad UND, controla inventario). El nombre, la
 * categoría, el impuesto y el precio (igual para todas, decisión del usuario) son los del modelo y se copian a cada
 * variante al guardarlo; el costo también, salvo en las variantes cuyo costo ya maneja el inventario.
 */
@Service
@RequiredArgsConstructor
public class ProductModelService {

    static final int MAX_COLORS = 20;
    static final int MAX_VARIANTS = 400;
    private static final String BASE_UNIT = "UND";

    private final ProductModelRepository models;
    private final ProductRepository products;
    private final ProductBarcodeRepository barcodes;
    private final CategoryRepository categories;
    private final TaxRepository taxes;
    private final UnitRepository units;
    private final SizeScaleService scales;
    private final ProductService productService;
    private final AuditLogger audit;

    public record ModelCommand(String skuPrefix, String name, String description, UUID categoryId, UUID taxId,
                               BigDecimal cost, BigDecimal salePrice, UUID sizeScaleId, List<String> sizes,
                               List<String> colors) {
    }

    /** Una variante (producto) del modelo; la unidad base va para las líneas de inventario de la cuadrícula. */
    public record VariantView(UUID productId, String sku, String name, String size, String color, String barcode,
                              UUID baseUnitId, String baseUnitCode, boolean active) {
    }

    /** Modelo con sus variantes, las tallas (en el orden de la escala) y los colores (en el orden de creación). */
    public record ModelView(UUID id, String skuPrefix, String name, String description, UUID categoryId,
                            String categoryName, UUID taxId, String taxCode, BigDecimal cost, BigDecimal salePrice,
                            UUID sizeScaleId, String sizeScaleName, boolean active, List<String> sizes,
                            List<String> colors, List<VariantView> variants) {
    }

    public record ModelRow(UUID id, String skuPrefix, String name, String categoryName, BigDecimal salePrice,
                           String sizeScaleName, long variants, boolean active) {
    }

    // ------------------------------------------------------------------ consultas

    @Transactional(readOnly = true)
    public Page<ModelRow> search(String search, boolean includeInactive, Pageable pageable) {
        String term = search == null ? "" : search.trim();
        String pattern = "%" + ProductService.escapeLike(term.toLowerCase(Locale.ROOT)) + "%";
        Page<ProductModel> page = models.search(pattern, pattern.toUpperCase(Locale.ROOT), includeInactive, pageable);
        Map<UUID, Long> counts = new HashMap<>();
        if (!page.isEmpty()) {
            for (Object[] row : products.countVariants(page.map(ProductModel::getId).getContent())) {
                counts.put((UUID) row[0], (Long) row[1]);
            }
        }
        Map<UUID, String> categoryNames = new HashMap<>();
        categories.findAll().forEach(c -> categoryNames.put(c.getId(), c.getName()));
        Map<UUID, String> scaleNames = new HashMap<>();
        scales.list().forEach(s -> scaleNames.put(s.id(), s.name()));
        return page.map(m -> new ModelRow(m.getId(), m.getSkuPrefix(), m.getName(),
                m.getCategoryId() == null ? null : categoryNames.get(m.getCategoryId()), m.getSalePrice(),
                scaleNames.get(m.getSizeScaleId()), counts.getOrDefault(m.getId(), 0L), m.isActive()));
    }

    @Transactional(readOnly = true)
    public ModelView get(UUID id) {
        return view(find(id));
    }

    // ------------------------------------------------------------------ escritura

    @Transactional
    public ModelView create(ModelCommand c) {
        String prefix = prefix(c.skuPrefix());
        if (models.findBySkuPrefixIgnoreCase(prefix).isPresent()) {
            throw new ConflictException("Ya existe un modelo con el prefijo " + prefix + ".");
        }
        SizeScale scale = scales.find(c.sizeScaleId());
        if (!scale.isActive()) {
            throw new BusinessRuleException("La escala de tallas está inactiva.");
        }
        ProductModel model = models.save(ProductModel.create(prefix, scale.getId(), validData(c)));
        createVariants(model, c.sizes(), c.colors());
        ModelView view = view(model);
        audit.log("PRODUCT_MODEL_CREATED", "product_model", model.getId(), null, snapshot(view));
        return view;
    }

    /** Cambia los datos del modelo y los copia a todas sus variantes. El prefijo y la escala no cambian. */
    @Transactional
    public ModelView update(UUID id, ModelCommand c) {
        ProductModel model = find(id);
        Map<String, Object> before = snapshot(view(model));
        ProductModel.Data data = validData(c);
        if (c.cost() == null) {
            // Sin costo en la petición: se conserva el actual (no se pone en cero).
            data = new ProductModel.Data(data.name(), data.description(), data.categoryId(), data.taxId(),
                    model.getCost(), data.salePrice());
        }
        model.apply(data);
        for (Product variant : products.findByModelId(id)) {
            variant.apply(variantData(model, variant.getSku(), variant.getVariantSize(), variant.getVariantColor(),
                    variant.getBaseUnitId(), variant.isCostLocked() ? variant.getCost() : model.getCost()));
        }
        ModelView view = view(model);
        audit.log("PRODUCT_MODEL_UPDATED", "product_model", id, before, snapshot(view));
        return view;
    }

    /** Agrega las combinaciones talla × color que falten (las que ya existen se dejan como están). */
    @Transactional
    public ModelView addVariants(UUID id, List<String> sizes, List<String> colors) {
        ProductModel model = find(id);
        if (!model.isActive()) {
            throw new BusinessRuleException("Activa primero el modelo.");
        }
        int created = createVariants(model, sizes, colors);
        if (created == 0) {
            throw new BusinessRuleException("Esas tallas y colores ya existen en el modelo.");
        }
        ModelView view = view(model);
        audit.log("PRODUCT_MODEL_VARIANTS_ADDED", "product_model", id, null, Map.of("created", created));
        return view;
    }

    /** Activa o desactiva el modelo y todas sus variantes. */
    @Transactional
    public ModelView setActive(UUID id, boolean active) {
        ProductModel model = find(id);
        if (model.isActive() != active) {
            model.setActive(active);
            products.findByModelId(id).forEach(v -> v.setActive(active));
            audit.log(active ? "PRODUCT_MODEL_ACTIVATED" : "PRODUCT_MODEL_DEACTIVATED", "product_model", id, null,
                    null);
        }
        return view(model);
    }

    /**
     * Cambia el código de barras de una variante (p. ej. por el que trae el proveedor) o la activa/desactiva.
     * {@code barcode} nulo = no cambia el código.
     */
    @Transactional
    public ModelView updateVariant(UUID modelId, UUID productId, String barcode, Boolean active) {
        ProductModel model = find(modelId);
        Product variant = products.findById(productId)
                .filter(p -> modelId.equals(p.getModelId()))
                .orElseThrow(() -> new NotFoundException("Esa talla no es de este modelo."));
        if (barcode != null) {
            String code = CatalogCodes.barcode(barcode);
            barcodes.findByBarcode(code)
                    .filter(existing -> !existing.getProduct().getId().equals(productId))
                    .ifPresent(existing -> {
                        throw new ConflictException("El código " + code + " ya pertenece al producto "
                                + existing.getProduct().getSku() + " — " + existing.getProduct().getName() + ".");
                    });
            boolean internal = variant.getBarcodes().stream()
                    .anyMatch(b -> b.getBarcode().equals(code) && b.isInternal());
            variant.replaceBarcodes(Set.of(new Product.BarcodeData(code, null, internal)));
        }
        if (active != null) {
            if (active && !model.isActive()) {
                throw new BusinessRuleException("Activa primero el modelo.");
            }
            variant.setActive(active);
        }
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("barcode", firstBarcode(variant));
        after.put("active", variant.isActive());
        audit.log("PRODUCT_VARIANT_UPDATED", "product", productId, null, after);
        return view(model);
    }

    // ------------------------------------------------------------------ variantes

    private int createVariants(ProductModel model, List<String> rawSizes, List<String> rawColors) {
        List<Size> scaleSizes = scales.sizesOf(model.getSizeScaleId());
        List<String> sizes = validSizes(rawSizes, scaleSizes);
        List<String> colors = validColors(rawColors);
        if ((long) sizes.size() * Math.max(1, colors.size()) > MAX_VARIANTS) {
            throw new BusinessRuleException("Son demasiadas combinaciones: máximo " + MAX_VARIANTS + " por vez.");
        }
        List<Product> existing = products.findByModelId(model.getId());
        Set<String> existingKeys = new HashSet<>();
        Set<String> existingColors = new HashSet<>();
        existing.forEach(p -> {
            existingKeys.add(key(p.getVariantSize(), p.getVariantColor()));
            if (p.getVariantColor() != null) {
                existingColors.add(p.getVariantColor().toLowerCase(Locale.ROOT));
            }
        });
        Set<String> allColors = new HashSet<>(existingColors);
        colors.forEach(c -> allColors.add(c.toLowerCase(Locale.ROOT)));
        if (allColors.size() > MAX_COLORS) {
            throw new BusinessRuleException("Máximo " + MAX_COLORS + " colores por modelo.");
        }
        if (!existing.isEmpty()) {
            boolean modelHasColors = !existingColors.isEmpty();
            if (modelHasColors && colors.isEmpty()) {
                throw new BusinessRuleException("Este modelo maneja colores: indica al menos uno.");
            }
            if (!modelHasColors && !colors.isEmpty()) {
                throw new BusinessRuleException("Este modelo no maneja colores: agrega solo tallas.");
            }
        }
        UUID baseUnit = baseUnitId();
        List<String> colorList = colors.isEmpty() ? java.util.Collections.singletonList(null) : colors;
        // El sufijo de cada color se reutiliza de sus tallas existentes: un color conserva siempre el mismo sufijo.
        Map<String, String> colorTokens = new HashMap<>();
        for (Product p : existing) {
            if (p.getVariantColor() != null) {
                String prefix = model.getSkuPrefix() + "-" + CatalogVariants.token(p.getVariantSize(), 10) + "-";
                if (p.getSku().startsWith(prefix)) {
                    colorTokens.putIfAbsent(p.getVariantColor().toLowerCase(Locale.ROOT),
                            p.getSku().substring(prefix.length()));
                }
            }
        }
        int created = 0;
        for (String color : colorList) {
            for (String size : sizes) {
                if (existingKeys.contains(key(size, color))) {
                    continue;
                }
                String sku = freeSku(model.getSkuPrefix(), size, color, colorTokens);
                Product variant = Product.createVariant(variantData(model, sku, size, color, baseUnit, model.getCost()),
                        model.getId(), size, color);
                variant.replaceBarcodes(Set.of(new Product.BarcodeData(productService.nextInternalBarcode(), null,
                        true)));
                products.save(variant);
                existingKeys.add(key(size, color));
                created++;
            }
        }
        return created;
    }

    private Product.Data variantData(ProductModel model, String sku, String size, String color, UUID baseUnit,
                                     BigDecimal cost) {
        return new Product.Data(sku, CatalogVariants.name(model.getName(), size, color), model.getDescription(),
                model.getCategoryId(), baseUnit, model.getTaxId(), cost, model.getSalePrice(), true);
    }

    /** SKU libre: {@code PREFIJO-TALLA-COLOR}; si el color se abrevia igual que otro, se le agrega un número. */
    private String freeSku(String prefix, String size, String color, Map<String, String> colorTokens) {
        String token = color == null ? null : colorTokens.computeIfAbsent(color.toLowerCase(Locale.ROOT),
                k -> uniqueToken(CatalogVariants.token(color, 6), colorTokens.values()));
        String sku = CatalogVariants.sku(prefix, size, token);
        for (int i = 2; products.findBySkuIgnoreCase(sku).isPresent(); i++) {
            if (i > 50) {
                throw new ConflictException("No se encontró un SKU libre para la talla " + size
                        + (color == null ? "" : " " + color) + ". Cambia el prefijo del modelo.");
            }
            sku = CatalogVariants.sku(prefix, size, (token == null ? "" : token) + i);
        }
        return sku;
    }

    /** "AZULCI" ya es de otro color del modelo → "AZULCI2", "AZULCI3"… */
    private static String uniqueToken(String base, java.util.Collection<String> taken) {
        String token = base;
        for (int i = 2; taken.contains(token); i++) {
            token = base + i;
        }
        return token;
    }

    private static List<String> validSizes(List<String> raw, List<Size> scaleSizes) {
        if (raw == null || raw.isEmpty()) {
            throw new BusinessRuleException("Elige al menos una talla.");
        }
        Set<String> wanted = new HashSet<>();
        raw.forEach(s -> wanted.add(s == null ? "" : s.trim().toUpperCase(Locale.ROOT)));
        List<String> ordered = scaleSizes.stream().map(Size::label).filter(wanted::contains).toList();
        if (ordered.size() != wanted.size()) {
            throw new BusinessRuleException("Hay tallas que no están en la escala del modelo.");
        }
        return ordered;
    }

    private static List<String> validColors(List<String> raw) {
        if (raw == null) {
            return List.of();
        }
        Map<String, String> unique = new LinkedHashMap<>();
        for (String color : raw) {
            String clean = color == null ? "" : color.trim().replaceAll("\\s+", " ");
            if (clean.isEmpty()) {
                continue;
            }
            if (clean.length() > 40) {
                throw new BusinessRuleException("El color '" + clean + "' es muy largo (máximo 40).");
            }
            if (CatalogVariants.token(clean, 6).isEmpty()) {
                throw new BusinessRuleException("El color '" + clean + "' debe tener letras o números.");
            }
            unique.putIfAbsent(clean.toLowerCase(Locale.ROOT), capitalize(clean));
        }
        if (unique.size() > MAX_COLORS) {
            throw new BusinessRuleException("Máximo " + MAX_COLORS + " colores por modelo.");
        }
        return new ArrayList<>(unique.values());
    }

    // ------------------------------------------------------------------ validación y vistas

    private ProductModel.Data validData(ModelCommand c) {
        String name = c.name() == null ? "" : c.name().trim();
        if (name.isEmpty()) {
            throw new BusinessRuleException("El nombre del modelo es obligatorio.");
        }
        if (c.categoryId() != null) {
            Category category = categories.findById(c.categoryId()).orElse(null);
            if (category == null || !category.isActive()) {
                throw new BusinessRuleException("La categoría no existe o está inactiva.");
            }
        }
        Tax tax = c.taxId() == null ? null : taxes.findById(c.taxId()).orElse(null);
        if (tax == null || !tax.isActive()) {
            throw new BusinessRuleException("El impuesto no existe o está inactivo.");
        }
        if (c.salePrice() == null || c.salePrice().signum() < 0) {
            throw new BusinessRuleException("El precio de venta es obligatorio y no puede ser negativo.");
        }
        BigDecimal cost = c.cost() == null ? BigDecimal.ZERO : c.cost();
        if (cost.signum() < 0) {
            throw new BusinessRuleException("El costo no puede ser negativo.");
        }
        String description = c.description() == null || c.description().isBlank() ? null : c.description().trim();
        return new ProductModel.Data(name, description, c.categoryId(), c.taxId(), cost, c.salePrice());
    }

    private static String prefix(String raw) {
        String value = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (!value.matches("^[A-Z0-9][A-Z0-9._-]{0,19}$")) {
            throw new BusinessRuleException("El prefijo del SKU usa de 1 a 20 letras, números, '.', '_' o '-'.");
        }
        return value;
    }

    private UUID baseUnitId() {
        return units.findByCode(BASE_UNIT).filter(Unit::isActive).map(Unit::getId)
                .orElseThrow(() -> new BusinessRuleException("La unidad UND está inactiva: actívala para crear tallas."));
    }

    ProductModel find(UUID id) {
        return models.findById(id).orElseThrow(() -> new NotFoundException("Modelo no encontrado."));
    }

    private ModelView view(ProductModel m) {
        List<Size> scaleSizes = scales.sizesOf(m.getSizeScaleId());
        Map<String, Integer> position = new HashMap<>();
        for (int i = 0; i < scaleSizes.size(); i++) {
            position.put(scaleSizes.get(i).label(), i);
        }
        List<Product> variants = new ArrayList<>(products.findByModelId(m.getId()));
        // Colores en el orden en que se crearon; tallas en el orden de la escala.
        variants.sort(Comparator.comparing(Product::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Product::getId));
        Set<String> colors = new LinkedHashSet<>();
        Set<String> sizeSet = new HashSet<>();
        for (Product v : variants) {
            if (v.getVariantColor() != null) {
                colors.add(v.getVariantColor());
            }
            sizeSet.add(v.getVariantSize());
        }
        List<String> colorOrder = new ArrayList<>(colors);
        Map<UUID, String> unitCodes = new HashMap<>();
        List<String> sizes = sizeSet.stream()
                .sorted(Comparator.comparing((String s) -> position.getOrDefault(s, Integer.MAX_VALUE))
                        .thenComparing(Comparator.naturalOrder()))
                .toList();
        List<VariantView> variantViews = variants.stream()
                .sorted(Comparator.comparing((Product v) -> v.getVariantColor() == null ? -1
                                : colorOrder.indexOf(v.getVariantColor()))
                        .thenComparing(v -> position.getOrDefault(v.getVariantSize(), Integer.MAX_VALUE)))
                .map(v -> new VariantView(v.getId(), v.getSku(), v.getName(), v.getVariantSize(),
                        v.getVariantColor(), firstBarcode(v), v.getBaseUnitId(),
                        unitCodes.computeIfAbsent(v.getBaseUnitId(),
                                id -> units.findById(id).map(Unit::getCode).orElse("")),
                        v.isActive()))
                .toList();
        Category category = m.getCategoryId() == null ? null : categories.findById(m.getCategoryId()).orElse(null);
        Tax tax = taxes.findById(m.getTaxId()).orElse(null);
        String scaleName = scales.find(m.getSizeScaleId()).getName();
        return new ModelView(m.getId(), m.getSkuPrefix(), m.getName(), m.getDescription(), m.getCategoryId(),
                category == null ? null : category.getName(), m.getTaxId(), tax == null ? null : tax.getCode(),
                m.getCost().setScale(2, RoundingMode.HALF_UP), m.getSalePrice(), m.getSizeScaleId(), scaleName,
                m.isActive(), sizes, colorOrder, variantViews);
    }

    private static String firstBarcode(Product p) {
        return p.getBarcodes().stream().map(ProductBarcode::getBarcode).sorted().findFirst().orElse(null);
    }

    private static String key(String size, String color) {
        return size + "|" + (color == null ? "" : color.toLowerCase(Locale.ROOT));
    }

    private static String capitalize(String text) {
        return text.substring(0, 1).toUpperCase(Locale.ROOT) + text.substring(1);
    }

    private static Map<String, Object> snapshot(ModelView v) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("skuPrefix", v.skuPrefix());
        data.put("name", v.name());
        data.put("categoryId", v.categoryId());
        data.put("tax", v.taxCode());
        data.put("cost", v.cost());
        data.put("salePrice", v.salePrice());
        data.put("sizes", v.sizes());
        data.put("colors", v.colors());
        data.put("variants", v.variants().size());
        return data;
    }
}
