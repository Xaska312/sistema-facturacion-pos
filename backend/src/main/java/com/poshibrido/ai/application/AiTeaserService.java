package com.poshibrido.ai.application;

import com.poshibrido.inventory.application.InventoryQueryService;
import com.poshibrido.reporting.application.ReportQueryService;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.subscription.application.SubscriptionApi;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Set;

/**
 * "Aska encontró…" (decisión 302): a quien no tiene XASKA IA, Inicio le muestra lo que Aska vería en su negocio
 * (productos bajo el mínimo y plata quieta en productos sin rotación), con las cifras pero sin los detalles. Se calcula
 * con los reportes de siempre: no usa la IA ni gasta nada.
 */
@Service
@RequiredArgsConstructor
public class AiTeaserService {

    static final int SLOW_DAYS = 60;

    private final InventoryQueryService inventory;
    private final ReportQueryService reports;
    private final SubscriptionApi subscriptions;

    public record Teaser(boolean show, long lowStock, long slowProducts, BigDecimal slowValue, boolean canBuy) {
    }

    public Teaser teaser() {
        var tenant = TenantContext.current().orElse(null);
        Set<String> permissions = CurrentActor.permissions();
        boolean canBuy = permissions.contains("settings:manage");
        if (tenant == null || subscriptions.aiMonthlyLimit(tenant.id(), "QUESTIONS") > 0) {
            return new Teaser(false, 0, 0, BigDecimal.ZERO, canBuy);
        }
        long low = permissions.contains("inventory:read") ? inventory.alerts(null).size() : 0;
        long slow = 0;
        BigDecimal value = BigDecimal.ZERO;
        if (permissions.contains("reports:read")) {
            var s = reports.slowMovers(null, SLOW_DAYS);
            slow = s.productCount();
            value = s.totalValue() == null ? BigDecimal.ZERO : s.totalValue();
        }
        return new Teaser(low > 0 || slow > 0, low, slow, value, canBuy);
    }
}
