package com.poshibrido.catalog.application;

import com.poshibrido.catalog.domain.TaxType;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Precio de venta vigente para otros módulos (ventas en Fase 5). Los precios incluyen o no el
 * impuesto según el ajuste {@code prices_include_tax} del negocio; aquí solo se resuelve el valor.
 */
public interface PricingApi {

    record ResolvedPrice(UUID productId, String sku, String name, UUID unitId, String unitCode, BigDecimal factor,
                         BigDecimal price, UUID priceListId, boolean fromList, UUID taxId, TaxType taxType,
                         BigDecimal taxRate, boolean trackInventory, boolean openPrice) {

        /**
         * Precio libre (decisión 253): el precio que escribió el cajero reemplaza al sugerido. No viene de una lista
         * de precios.
         */
        public ResolvedPrice withTypedPrice(BigDecimal typed) {
            return new ResolvedPrice(productId, sku, name, unitId, unitCode, factor, typed, null, false, taxId, taxType,
                    taxRate, trackInventory, openPrice);
        }
    }

    /**
     * @param priceListId lista del cliente; nula = General. Si la lista no tiene precio para esa unidad,
     *                    se usa el de la General.
     */
    ResolvedPrice price(UUID productId, UUID unitId, UUID priceListId);
}
