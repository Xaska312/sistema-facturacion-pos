package com.poshibrido.orders.application;

import com.poshibrido.catalog.application.PricingApi;
import com.poshibrido.catalog.domain.TaxType;
import com.poshibrido.finance.application.WithholdingApi;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.sales.domain.SaleCalculator;
import com.poshibrido.sales.domain.SaleCalculator.LineAmounts;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

/**
 * Base gravable e IVA de lo que falta entregar de un pedido (decisión 322), calculados como los calculará la venta al
 * entregar (impuesto del producto y "precios con IVA" de hoy). Sirven para la base de las retenciones de un abono.
 */
@Component
@RequiredArgsConstructor
public class OrderTaxes {

    @PersistenceContext
    private EntityManager em;

    private final PricingApi pricing;
    private final BusinessSettingsApi settings;

    /** Base gravable e IVA de una línea del pedido. */
    public record Amounts(BigDecimal base, BigDecimal iva) {
    }

    public Amounts line(UUID productId, BigDecimal unitPrice, BigDecimal quantity) {
        return line(productId, unitPrice, quantity, BigDecimal.ZERO);
    }

    /** Con descuento por línea (cotizaciones). */
    public Amounts line(UUID productId, BigDecimal unitPrice, BigDecimal quantity, BigDecimal discountPercent) {
        PricingApi.ResolvedPrice price = pricing.price(productId, null, null);
        LineAmounts a = SaleCalculator.line(unitPrice, quantity,
                discountPercent == null ? BigDecimal.ZERO : discountPercent, price.taxRate(),
                settings.current().pricesIncludeTax());
        return new Amounts(a.taxableBase(), price.taxType() == TaxType.IVA ? a.tax() : BigDecimal.ZERO);
    }

    /** Bases de las retenciones sobre {@code gross} de abono, en proporción a lo pendiente del pedido. */
    public WithholdingApi.Bases bases(UUID orderId, BigDecimal gross) {
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal base = BigDecimal.ZERO;
        BigDecimal iva = BigDecimal.ZERO;
        for (Object row : em.createNativeQuery("""
                SELECT product_id, unit_price, quantity, total FROM order_items
                WHERE order_id = ?1 AND sale_id IS NULL""").setParameter(1, orderId).getResultList()) {
            Object[] r = (Object[]) row;
            Amounts a = line((UUID) r[0], (BigDecimal) r[1], (BigDecimal) r[2]);
            total = total.add((BigDecimal) r[3]);
            base = base.add(a.base());
            iva = iva.add(a.iva());
        }
        if (total.signum() <= 0) {
            return new WithholdingApi.Bases(BigDecimal.ZERO, BigDecimal.ZERO);
        }
        return new WithholdingApi.Bases(gross.multiply(base).divide(total, 0, RoundingMode.HALF_UP),
                gross.multiply(iva).divide(total, 0, RoundingMode.HALF_UP));
    }
}
