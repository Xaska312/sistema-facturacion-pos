package com.poshibrido.organization.application;

import java.math.BigDecimal;

/**
 * Ajustes del negocio, tipados. Los módulos de ventas e inventario los leen con {@link BusinessSettingsApi}.
 * {@code cashCloseEmail}: enviar al dueño el resumen de cada cierre de caja (decisión 253).
 * {@code quoteValidityDays} y {@code quoteTerms}: vigencia y condiciones por defecto de las cotizaciones (decisión 260).
 * {@code tipPercent}: propina voluntaria que se sugiere al cobrar una cuenta de mesa (Fase 12b-5; 0 = no se sugiere).
 * {@code expiryAlertMonths}: con cuántos meses de anticipación se avisa que un lote está por vencer (Fase 13-3, 1 a 12).
 * {@code creditReminder}: mensaje de WhatsApp para recordar el fiado, con {cliente}, {saldo}, {negocio}, {desde} y
 * {dias}; vacío = el mensaje de siempre (decisión 344).
 * {@code costsIncludeTax}: los costos que se escriben a mano (producto, cargas, inventario, compras) traen el IVA
 * incluido y la app se lo quita al guardarlos; el costo guardado siempre es sin IVA (decisión 348).
 * {@code dayStartHour}: hora en que empieza el día del negocio, de 0 (medianoche) a 11 (decisión 380). Un bar que
 * cierra a las 3 a. m. pone 6: lo vendido hasta las 6 a. m. del sábado cuenta en el viernes en reportes e Inicio.
 */
public record BusinessSettings(boolean allowNegativeStock, boolean pricesIncludeTax, String timezone,
                               String currency, String receiptFooter, BigDecimal maxDiscountPercent,
                               boolean cashCloseEmail, int quoteValidityDays, String quoteTerms,
                               int tipPercent, int expiryAlertMonths, String receiptHeader,
                               String creditReminder, boolean costsIncludeTax, int dayStartHour) {
}
