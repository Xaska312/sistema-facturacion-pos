package com.poshibrido.organization.application;

import java.math.BigDecimal;

/**
 * Ajustes del negocio, tipados. Los módulos de ventas e inventario los leen con {@link BusinessSettingsApi}.
 */
public record BusinessSettings(boolean allowNegativeStock, boolean pricesIncludeTax, String timezone,
                               String currency, String receiptFooter, BigDecimal maxDiscountPercent) {
}
