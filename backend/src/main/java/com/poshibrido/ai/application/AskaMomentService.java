package com.poshibrido.ai.application;

import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.subscription.application.SubscriptionApi;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

/**
 * Aska en el momento del dolor (decisión 308): las pantallas donde alguien hace a mano lo que Aska hace con una foto
 * (digitar una compra larga, crear productos uno por uno, un inventario vacío) preguntan aquí si el negocio tiene
 * XASKA IA y, si no, si quien mira puede activar la prueba gratis. No usa la IA ni gasta nada.
 */
@Service
@RequiredArgsConstructor
public class AskaMomentService {

    /** Con menos productos todavía no es "un inventario vacío", es un negocio que está empezando. */
    static final int MIN_PRODUCTS = 5;

    private final SubscriptionApi subscriptions;

    @PersistenceContext
    private EntityManager em;

    /**
     * {@code hasAi}: el negocio tiene XASKA IA (pagada o en prueba). {@code canBuy}: quien mira puede activarla (dueño).
     * {@code trialAvailable}: puede empezar la prueba gratis. {@code emptyStock}: hay al menos 5 productos que llevan
     * inventario y como mucho 1 de cada 5 tiene existencias en alguna sede.
     */
    public record Moments(boolean hasAi, boolean canBuy, boolean trialAvailable, boolean emptyStock) {
    }

    @Transactional(readOnly = true)
    public Moments moments() {
        var tenant = TenantContext.current().orElse(null);
        Set<String> permissions = CurrentActor.permissions();
        boolean canBuy = permissions.contains("settings:manage");
        if (tenant == null) {
            return new Moments(false, canBuy, false, false);
        }
        boolean hasAi = subscriptions.aiMonthlyLimit(tenant.id(), "QUESTIONS") > 0;
        boolean trial = canBuy && !hasAi && subscriptions.aiTrialAvailable(tenant.id());
        boolean empty = permissions.contains("inventory:read") && emptyStock();
        return new Moments(hasAi, canBuy, trial, empty);
    }

    private boolean emptyStock() {
        Object[] row = (Object[]) em.createNativeQuery("""
                SELECT count(*),
                       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM stock_balances b WHERE b.product_id = p.id
                                                      AND b.lot_id IS NULL AND b.quantity > 0))
                FROM products p WHERE p.active AND p.track_inventory""").getSingleResult();
        long total = ((Number) row[0]).longValue();
        long stocked = ((Number) row[1]).longValue();
        return isEmpty(total, stocked);
    }

    /**
     * La prueba gratis de XASKA IA (decisión 311): cuándo termina, cuántos días quedan y los tres retos de la bienvenida
     * (leer una factura, preguntarle a Aska, cargar con Aska). Nulo si el negocio no la tiene solo por la prueba.
     */
    public record Trial(java.time.Instant endsAt, long daysLeft, boolean scanned, boolean asked, boolean loaded) {
    }

    @Transactional(readOnly = true)
    public Trial trial() {
        var tenant = TenantContext.current().orElse(null);
        java.time.Instant ends = tenant == null ? null : subscriptions.aiTrialEndsAt(tenant.id());
        if (ends == null) {
            return null;
        }
        long left = Math.max(0, (long) Math.ceil(java.time.Duration.between(java.time.Instant.now(), ends).toHours() / 24.0));
        Object[] r = (Object[]) em.createNativeQuery("""
                SELECT EXISTS (SELECT 1 FROM purchase_invoice_scans WHERE status = 'OK'),
                       EXISTS (SELECT 1 FROM ai_questions WHERE status = 'OK' AND kind = 'QUESTION'),
                       EXISTS (SELECT 1 FROM ai_questions WHERE status = 'OK' AND kind = 'CATALOG_READ')""")
                .getSingleResult();
        return new Trial(ends, left, Boolean.TRUE.equals(r[0]), Boolean.TRUE.equals(r[1]), Boolean.TRUE.equals(r[2]));
    }

    static boolean isEmpty(long total, long stocked) {
        return total >= MIN_PRODUCTS && stocked * 5 <= total;
    }
}
