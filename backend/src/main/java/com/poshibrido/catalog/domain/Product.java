package com.poshibrido.catalog.domain;

import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.persistence.AuditableEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Producto del catálogo. Agrega sus presentaciones y códigos de barras; los cambios se aplican
 * comparando con lo existente (no borrar y reinsertar) para no chocar con las restricciones únicas.
 */
@Getter
@Entity
@Table(name = "products")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Product extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String sku;

    @Column(nullable = false)
    private String name;

    @Column
    private String description;

    @Column(name = "category_id")
    private UUID categoryId;

    @Column(name = "base_unit_id", nullable = false)
    private UUID baseUnitId;

    @Column(name = "tax_id", nullable = false)
    private UUID taxId;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal cost;

    @Column(name = "sale_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal salePrice;

    @Column(name = "track_inventory", nullable = false)
    private boolean trackInventory;

    @Column(name = "tracks_lots", nullable = false)
    private boolean tracksLots;

    @Column(nullable = false)
    private boolean active;

    /** Verdadero cuando el inventario ya maneja el costo (promedio ponderado): no se edita a mano. */
    @Column(name = "cost_locked", nullable = false)
    private boolean costLocked;

    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<ProductUnitConversion> conversions = new HashSet<>();

    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<ProductBarcode> barcodes = new HashSet<>();

    /** Datos básicos editables. */
    public record Data(String sku, String name, String description, UUID categoryId, UUID baseUnitId, UUID taxId,
                       BigDecimal cost, BigDecimal salePrice, boolean trackInventory) {
    }

    public record ConversionData(UUID unitId, BigDecimal factor, BigDecimal salePrice) {
    }

    public record BarcodeData(String barcode, UUID unitId, boolean internal) {
    }

    public static Product create(Data data) {
        Product product = new Product();
        product.id = Ids.newId();
        product.active = true;
        product.tracksLots = false;
        product.apply(data);
        return product;
    }

    public void apply(Data data) {
        this.sku = data.sku();
        this.name = data.name();
        this.description = data.description();
        this.categoryId = data.categoryId();
        this.baseUnitId = data.baseUnitId();
        this.taxId = data.taxId();
        this.cost = data.cost().setScale(2, RoundingMode.HALF_UP);
        this.salePrice = data.salePrice().setScale(2, RoundingMode.HALF_UP);
        this.trackInventory = data.trackInventory();
    }

    /** Reemplaza las presentaciones: actualiza las que siguen, quita las que no y agrega las nuevas. */
    public void replaceConversions(Set<ConversionData> wanted) {
        Map<UUID, ConversionData> byUnit = wanted.stream()
                .collect(Collectors.toMap(ConversionData::unitId, Function.identity()));
        conversions.removeIf(c -> !byUnit.containsKey(c.getUnitId()));
        for (ProductUnitConversion existing : conversions) {
            ConversionData data = byUnit.remove(existing.getUnitId());
            existing.update(scale4(data.factor()), scale2(data.salePrice()));
        }
        for (ConversionData data : byUnit.values()) {
            conversions.add(new ProductUnitConversion(this, data.unitId(), scale4(data.factor()), scale2(data.salePrice())));
        }
    }

    /** Reemplaza los códigos de barras con la misma estrategia que las presentaciones. */
    public void replaceBarcodes(Set<BarcodeData> wanted) {
        Map<String, BarcodeData> byCode = wanted.stream()
                .collect(Collectors.toMap(BarcodeData::barcode, Function.identity()));
        barcodes.removeIf(b -> !byCode.containsKey(b.getBarcode()));
        for (ProductBarcode existing : barcodes) {
            existing.changeUnit(byCode.remove(existing.getBarcode()).unitId());
        }
        for (BarcodeData data : byCode.values()) {
            barcodes.add(new ProductBarcode(this, data.barcode(), data.unitId(), data.internal()));
        }
    }

    /** Agrega un código si no lo tiene (usado por la importación). */
    public void addBarcodeIfMissing(String barcode) {
        if (barcodes.stream().noneMatch(b -> b.getBarcode().equals(barcode))) {
            barcodes.add(new ProductBarcode(this, barcode, null, false));
        }
    }

    public Optional<ProductUnitConversion> conversionFor(UUID unitId) {
        return conversions.stream().filter(c -> c.getUnitId().equals(unitId)).findFirst();
    }

    /** Precio en la lista General para la unidad indicada (base o presentación). */
    public Optional<BigDecimal> generalPrice(UUID unitId) {
        if (baseUnitId.equals(unitId)) {
            return Optional.of(salePrice);
        }
        return conversionFor(unitId).map(c -> c.getSalePrice() != null
                ? c.getSalePrice()
                : salePrice.multiply(c.getFactor()).setScale(2, RoundingMode.HALF_UP));
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    /** Costo promedio ponderado calculado por el inventario. */
    public void applyAverageCost(BigDecimal averageCost) {
        this.cost = averageCost.setScale(2, RoundingMode.HALF_UP);
        this.costLocked = true;
    }

    public void lockCost() {
        this.costLocked = true;
    }

    /** Factor de conversión a la unidad base (1 para la base); vacío si la unidad no es del producto. */
    public Optional<BigDecimal> factorFor(UUID unitId) {
        if (baseUnitId.equals(unitId)) {
            return Optional.of(BigDecimal.ONE);
        }
        return conversionFor(unitId).map(ProductUnitConversion::getFactor);
    }

    private static BigDecimal scale2(BigDecimal value) {
        return value == null ? null : value.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal scale4(BigDecimal value) {
        return value.setScale(4, RoundingMode.HALF_UP);
    }
}
