package com.poshibrido.catalog.application;

import com.poshibrido.catalog.domain.TaxType;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Producto con nombres resueltos (categoría, unidades, impuesto). */
public record ProductView(UUID id, String sku, String name, String description, UUID categoryId, String categoryName,
                          UUID baseUnitId, String baseUnitCode, UUID taxId, String taxCode, TaxType taxType,
                          BigDecimal taxRate, BigDecimal cost, boolean costLocked, BigDecimal salePrice,
                          boolean trackInventory, boolean openPrice, boolean tracksLots, boolean active,
                          List<ConversionView> conversions,
                          List<BarcodeView> barcodes, List<ListPriceView> listPrices, UUID modelId,
                          String variantSize, String variantColor, MedicineBadge medicine) {

    /**
     * Resumen de la ficha del medicamento (Fase 13-1, decisión 279) para la lista y el POS; nulo si no tiene ficha.
     */
    /**
     * {@code nextExpiration}: el vencimiento más cercano entre los lotes con existencia que aún no vencen (el que sale
     * primero con FEFO), y {@code expiringSoon} si cae dentro de los meses de aviso de Ajustes (Fase 13-3).
     */
    public record MedicineBadge(String kind, String saleCondition, String activeIngredients, boolean antibiotic,
                                boolean coldChain, boolean unitSale, java.time.LocalDate nextExpiration,
                                boolean expiringSoon) {
    }

    public record ConversionView(UUID unitId, String unitCode, BigDecimal factor, BigDecimal salePrice,
                                 BigDecimal effectivePrice) {
    }

    public record BarcodeView(String barcode, UUID unitId, String unitCode, boolean internal) {
    }

    public record ListPriceView(UUID priceListId, String priceListName, UUID unitId, String unitCode,
                                BigDecimal price) {
    }
}
