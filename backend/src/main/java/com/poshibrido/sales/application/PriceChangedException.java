package com.poshibrido.sales.application;

import com.poshibrido.shared.error.DomainException;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Los precios o el total que mostró la pantalla ya no son los vigentes (409 con el detalle). */
public class PriceChangedException extends DomainException {

    public record Change(int line, String sku, String name, BigDecimal expectedPrice, BigDecimal currentPrice) {
    }

    private final List<Change> changes;
    private final BigDecimal expectedTotal;
    private final BigDecimal currentTotal;

    public PriceChangedException(List<Change> changes, BigDecimal expectedTotal, BigDecimal currentTotal) {
        super(HttpStatus.CONFLICT, "Precios actualizados",
                "Los precios o el total cambiaron desde que se armó la venta. Revisa y cobra de nuevo.");
        this.changes = List.copyOf(changes);
        this.expectedTotal = expectedTotal;
        this.currentTotal = currentTotal;
    }

    @Override
    public Map<String, Object> getProperties() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("changes", changes);
        properties.put("expectedTotal", expectedTotal);
        properties.put("currentTotal", currentTotal);
        return properties;
    }
}
