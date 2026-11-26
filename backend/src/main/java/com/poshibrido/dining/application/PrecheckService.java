package com.poshibrido.dining.application;

import com.poshibrido.catalog.application.PricingApi;
import com.poshibrido.catalog.application.PricingApi.ResolvedPrice;
import com.poshibrido.dining.application.DiningViews.TabItemView;
import com.poshibrido.dining.application.DiningViews.TabView;
import com.poshibrido.organization.application.BusinessSettingsApi;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Precuenta (decisión 380): lo que falta por cobrar de una cuenta, para imprimirlo y que el cliente lo revise antes de
 * pagar. No es una venta ni cambia nada. Trae la base sin impuestos porque la propina sugerida se calcula sobre ella
 * (ley 1935 de 2018), igual que al cobrar.
 */
@Service
@RequiredArgsConstructor
public class PrecheckService {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final TabService tabs;
    private final PricingApi pricing;
    private final BusinessSettingsApi settings;

    public record Line(String name, BigDecimal quantity, BigDecimal unitPrice, BigDecimal total, String details) {
    }

    public record Precheck(UUID tabId, String label, String tableName, String zoneName, Integer guests,
                           String openedByName, Instant openedAt, Instant printedAt, List<Line> lines,
                           BigDecimal subtotal, BigDecimal tax, BigDecimal total, BigDecimal chargedTotal,
                           int tipPercent, BigDecimal suggestedTip) {
    }

    @Transactional(readOnly = true)
    public Precheck precheck(UUID tabId) {
        TabView tab = tabs.get(tabId);
        var current = settings.current();
        boolean taxIncluded = current.pricesIncludeTax();
        Map<String, BigDecimal> rates = new HashMap<>();
        List<Line> lines = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal base = BigDecimal.ZERO;
        for (TabItemView item : tab.items()) {
            if (item.voided() || item.saleId() != null) {
                continue;
            }
            BigDecimal lineTotal = item.unitPrice().multiply(item.quantity()).setScale(2, RoundingMode.HALF_UP);
            BigDecimal rate = rates.computeIfAbsent(item.productId() + "|" + item.unitId(), k -> rate(item));
            BigDecimal factor = BigDecimal.ONE.add(rate.divide(HUNDRED, 6, RoundingMode.HALF_UP));
            BigDecimal lineBase = taxIncluded ? lineTotal.divide(factor, 2, RoundingMode.HALF_UP) : lineTotal;
            BigDecimal lineGross = taxIncluded ? lineTotal : lineTotal.multiply(factor).setScale(2, RoundingMode.HALF_UP);
            total = total.add(lineGross);
            base = base.add(lineBase);
            lines.add(new Line(item.name(), item.quantity(), lineGross.divide(item.quantity(), 2, RoundingMode.HALF_UP),
                    lineGross, details(item)));
        }
        int tipPercent = current.tipPercent();
        BigDecimal tip = tipPercent > 0 && base.signum() > 0
                ? base.multiply(BigDecimal.valueOf(tipPercent)).divide(HUNDRED, 0, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        return new Precheck(tab.id(), tab.label(), tab.tableName(), tab.zoneName(), tab.guests(), tab.openedByName(),
                tab.openedAt(), Instant.now(), lines, base, total.subtract(base), total, tab.chargedTotal(), tipPercent,
                tip);
    }

    private BigDecimal rate(TabItemView item) {
        try {
            ResolvedPrice price = pricing.price(item.productId(), item.unitId(), null);
            return price.taxRate() == null ? BigDecimal.ZERO : price.taxRate();
        } catch (RuntimeException ex) {
            return BigDecimal.ZERO; // El producto ya no se vende: sin impuesto en la precuenta.
        }
    }

    /** "Con queso, sin cebolla · Bien asada": las adiciones y la nota de la línea. */
    private static String details(TabItemView item) {
        String mods = item.modifiers().stream()
                .map(m -> m.quantity() > 1 ? m.quantity() + "× " + m.name() : m.name())
                .collect(Collectors.joining(", "));
        String note = item.note() == null || item.note().isBlank() ? "" : item.note().strip();
        if (mods.isEmpty()) {
            return note.isEmpty() ? null : note;
        }
        return note.isEmpty() ? mods : mods + " · " + note;
    }
}
