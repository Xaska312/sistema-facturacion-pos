package com.poshibrido.organization.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.organization.domain.BusinessSetting;
import com.poshibrido.organization.domain.BusinessSetting.ValueType;
import com.poshibrido.organization.infrastructure.BusinessSettingRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.security.CurrentActor;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BusinessSettingsService implements BusinessSettingsApi {

    static final String ALLOW_NEGATIVE_STOCK = "allow_negative_stock";
    static final String PRICES_INCLUDE_TAX = "prices_include_tax";
    static final String TIMEZONE = "timezone";
    static final String CURRENCY = "currency";
    static final String RECEIPT_FOOTER = "receipt_footer";
    static final String MAX_DISCOUNT_PERCENT = "max_discount_percent";

    /** Monedas soportadas. En el MVP solo pesos colombianos. */
    private static final Set<String> CURRENCIES = Set.of("COP");

    private static final BusinessSettings DEFAULTS = new BusinessSettings(false, true, "America/Bogota", "COP",
            "Gracias por su compra", BigDecimal.ZERO.setScale(2));

    private final BusinessSettingRepository repository;
    private final AuditLogger audit;

    @Override
    @Transactional(readOnly = true)
    public BusinessSettings current() {
        Map<String, String> values = repository.findAll().stream()
                .collect(Collectors.toMap(BusinessSetting::getKey, BusinessSetting::getValue));
        return new BusinessSettings(
                bool(values, ALLOW_NEGATIVE_STOCK, DEFAULTS.allowNegativeStock()),
                bool(values, PRICES_INCLUDE_TAX, DEFAULTS.pricesIncludeTax()),
                values.getOrDefault(TIMEZONE, DEFAULTS.timezone()),
                values.getOrDefault(CURRENCY, DEFAULTS.currency()),
                values.getOrDefault(RECEIPT_FOOTER, DEFAULTS.receiptFooter()),
                decimal(values, MAX_DISCOUNT_PERCENT, DEFAULTS.maxDiscountPercent()));
    }

    @Transactional
    public BusinessSettings update(BusinessSettings requested) {
        validate(requested);
        BusinessSettings before = current();
        UUID actor = CurrentActor.userId().orElse(null);
        Map<String, BusinessSetting> rows = repository.findAll().stream()
                .collect(Collectors.toMap(BusinessSetting::getKey, Function.identity()));

        put(rows, ALLOW_NEGATIVE_STOCK, ValueType.BOOLEAN, Boolean.toString(requested.allowNegativeStock()), actor);
        put(rows, PRICES_INCLUDE_TAX, ValueType.BOOLEAN, Boolean.toString(requested.pricesIncludeTax()), actor);
        put(rows, TIMEZONE, ValueType.STRING, requested.timezone(), actor);
        put(rows, CURRENCY, ValueType.STRING, requested.currency(), actor);
        put(rows, RECEIPT_FOOTER, ValueType.STRING, requested.receiptFooter() == null ? "" : requested.receiptFooter().trim(), actor);
        put(rows, MAX_DISCOUNT_PERCENT, ValueType.DECIMAL,
                requested.maxDiscountPercent().setScale(2, RoundingMode.HALF_UP).toPlainString(), actor);

        BusinessSettings after = current();
        audit.log("SETTINGS_UPDATED", "business_settings", null, asMap(before), asMap(after));
        return after;
    }

    private void put(Map<String, BusinessSetting> rows, String key, ValueType type, String value, UUID actor) {
        BusinessSetting row = rows.get(key);
        if (row == null) {
            repository.save(BusinessSetting.of(key, type, value, actor));
        } else if (!row.getValue().equals(value)) {
            row.change(value, actor);
        }
    }

    private static void validate(BusinessSettings s) {
        try {
            ZoneId.of(s.timezone());
        } catch (DateTimeException | NullPointerException ex) {
            throw new BusinessRuleException("Zona horaria no válida: " + s.timezone());
        }
        // Solo zonas con nombre (America/Bogota): los desplazamientos fijos (-05:00) los interpreta distinto
        // PostgreSQL en AT TIME ZONE y los reportes agruparían mal por día y hora.
        if (!ZoneId.getAvailableZoneIds().contains(s.timezone())) {
            throw new BusinessRuleException("Usa una zona horaria con nombre, por ejemplo America/Bogota.");
        }
        if (!CURRENCIES.contains(s.currency())) {
            throw new BusinessRuleException("Moneda no soportada. Por ahora solo se admite COP.");
        }
        BigDecimal max = s.maxDiscountPercent();
        if (max == null || max.signum() < 0 || max.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new BusinessRuleException("El descuento máximo debe estar entre 0 y 100 %.");
        }
    }

    private static boolean bool(Map<String, String> values, String key, boolean fallback) {
        String value = values.get(key);
        return value == null ? fallback : Boolean.parseBoolean(value);
    }

    private static BigDecimal decimal(Map<String, String> values, String key, BigDecimal fallback) {
        String value = values.get(key);
        try {
            return value == null ? fallback : new BigDecimal(value).setScale(2, RoundingMode.HALF_UP);
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private static Map<String, Object> asMap(BusinessSettings s) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put(ALLOW_NEGATIVE_STOCK, s.allowNegativeStock());
        map.put(PRICES_INCLUDE_TAX, s.pricesIncludeTax());
        map.put(TIMEZONE, s.timezone());
        map.put(CURRENCY, s.currency());
        map.put(RECEIPT_FOOTER, s.receiptFooter());
        map.put(MAX_DISCOUNT_PERCENT, s.maxDiscountPercent());
        return map;
    }
}
