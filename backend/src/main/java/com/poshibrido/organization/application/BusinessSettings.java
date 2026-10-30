package com.poshibrido.organization.application;

import java.math.BigDecimal;

/**
 * Ajustes del negocio, tipados. Los módulos de ventas e inventario los leen con {@link BusinessSettingsApi}.
 * {@code cashCloseEmail}: enviar al dueño el resumen de cada cierre de caja (decisión 253).
 * {@code quoteValidityDays} y {@code quoteTerms}: vigencia y condiciones por defecto de las cotizaciones (decisión 260).
 * {@code tipPercent}: propina voluntaria que se sugiere al cobrar una cuenta de mesa (Fase 12b-5; 0 = no se sugiere).
 */
public record BusinessSettings(boolean allowNegativeStock, boolean pricesIncludeTax, String timezone,
                               String currency, String receiptFooter, BigDecimal maxDiscountPercent,
                               boolean cashCloseEmail, int quoteValidityDays, String quoteTerms,
                               int tipPercent) {
}
