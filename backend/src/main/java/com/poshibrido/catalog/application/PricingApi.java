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
                         BigDecimal taxRate, boolean trackInventory) {
    }

    /**
     * @param priceListId lista del cliente; nula = General. Si la lista no tiene precio para esa unidad,
     *                    se usa el de la General.
     */
    ResolvedPrice price(UUID productId, UUID unitId, UUID priceListId);
}
