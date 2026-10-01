package com.poshibrido.catalog.application;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Datos completos de un producto para crear o reemplazar (presentaciones, códigos y precios
 * en listas distintas de la General).
 */
public record ProductCommand(String sku, String name, String description, UUID categoryId, UUID baseUnitId,
                             UUID taxId, BigDecimal cost, BigDecimal salePrice, boolean trackInventory,
                             List<Conversion> conversions, List<Barcode> barcodes, List<ListPrice> listPrices) {

    public record Conversion(UUID unitId, BigDecimal factor, BigDecimal salePrice) {
    }

    /** {@code unitId} nulo = unidad base. {@code internal} = generado por el sistema. */
    public record Barcode(String barcode, UUID unitId, boolean internal) {
    }

    public record ListPrice(UUID priceListId, UUID unitId, BigDecimal price) {
    }
}
