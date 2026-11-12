package com.poshibrido.finance.application;

import com.poshibrido.credit.application.CreditQueryService;
import com.poshibrido.orders.application.OrderQueryService;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.purchasing.application.PurchaseService;
import com.poshibrido.purchasing.application.PurchaseViews.Payables;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Tablero de Finanzas (parte D, decisión 324): del mes en curso, la plata que entró y salió por medio de pago, lo que
 * te deben (fiados y pedidos), lo que debes (proveedores), los gastos frente al mes anterior y el punto de equilibrio
 * (cuánto hay que vender al día para cubrir los gastos). De todo el negocio, sin filtro de sede.
 */
@Service
@RequiredArgsConstructor
public class FinanceDashboardService {

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    @PersistenceContext
    private EntityManager em;

    private final ExpenseService expenses;
    private final RecurringExpenseService recurring;
    private final IncomeStatementService statements;
    private final CreditQueryService credit;
    private final OrderQueryService orders;
    private final PurchaseService purchases;
    private final BusinessSettingsApi settings;

    /** Plata de un medio de pago: lo que entró (ventas, abonos de fiado, anticipos) y lo que salió (gastos, proveedores). */
    public record MethodFlow(UUID paymentMethodId, String name, boolean cash, BigDecimal in, BigDecimal out,
                             BigDecimal net) {
    }

    public record Flow(BigDecimal in, BigDecimal out, BigDecimal net, List<MethodFlow> byMethod) {
    }

    /** Lo que te deben y lo que debes, a hoy. */
    public record Balances(BigDecimal creditOwed, long creditCustomers, BigDecimal ordersOwed, long openOrders,
                           BigDecimal suppliersOwed, BigDecimal suppliersOverdue, BigDecimal suppliersDueSoon) {
    }

    /** Gastos del mes hasta hoy frente a los mismos días del mes anterior, y los que más pesan. */
    public record ExpensesCompare(BigDecimal thisMonth, BigDecimal lastMonth, BigDecimal changePercent,
                                  List<ExpenseViews.CategoryTotal> top, int unpaidRecurring,
                                  BigDecimal unpaidRecurringTotal) {
    }

    /**
     * Punto de equilibrio. {@code basis}: LAST_MONTH (gastos del mes anterior completo), RECURRING (los gastos fijos
     * prendidos, sin gastos del mes anterior) o nulo si no hay con qué calcularlo. {@code grossMargin}: margen bruto de
     * los últimos 30 días, en %. {@code perDay}: ventas (sin IVA) al día para cubrir los gastos del mes.
     */
    public record BreakEven(String basis, BigDecimal monthlyExpenses, BigDecimal grossMargin, BigDecimal perMonth,
                            BigDecimal perDay, BigDecimal averageDailySales, BigDecimal monthSales,
                            BigDecimal monthTarget) {
    }

    public record Dashboard(LocalDate from, LocalDate to, BigDecimal netSales, BigDecimal grossProfit,
                            BigDecimal operatingProfit, Flow flow, Balances balances, ExpensesCompare expenses,
                            BreakEven breakEven) {
    }

    @Transactional(readOnly = true)
    public Dashboard dashboard() {
        ZoneId zone = zone();
        LocalDate today = LocalDate.now(zone);
        LocalDate from = today.withDayOfMonth(1);
        IncomeStatementService.Report month = statements.report(from, today, null);
        return new Dashboard(from, today, month.current().netSales(), month.current().grossProfit(),
                month.current().operatingProfit(), flow(from, today), balances(), expenses(from, today, month),
                breakEven(today, month.current().netSales()));
    }

    private Flow flow(LocalDate from, LocalDate to) {
        ZoneId zone = zone();
        Timestamp start = Timestamp.from(from.atStartOfDay(zone).toInstant());
        Timestamp end = Timestamp.from(to.plusDays(1).atStartOfDay(zone).toInstant());
        Map<UUID, BigDecimal[]> amounts = new LinkedHashMap<>();
        // Entra: ventas (sin fiado, anticipo ni retención: no es plata que entra ahí), abonos de fiado y anticipos.
        add(amounts, 0, em.createNativeQuery("""
                SELECT sp.payment_method_id, sum(sp.amount) FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
                WHERE s.status = 'COMPLETED' AND s.created_at >= ?1 AND s.created_at < ?2
                  AND sp.method_code NOT IN ('CREDIT', 'DEPOSIT', 'WITHHOLDING')
                GROUP BY sp.payment_method_id""").setParameter(1, start).setParameter(2, end).getResultList());
        add(amounts, 0, em.createNativeQuery("""
                SELECT coalesce(e.payment_method_id, p.payment_method_id), -sum(e.amount) FROM credit_entries e
                LEFT JOIN credit_entries p ON p.id = e.payment_id
                WHERE e.type IN ('PAYMENT', 'PAYMENT_VOID') AND e.created_at >= ?1 AND e.created_at < ?2
                GROUP BY 1""").setParameter(1, start).setParameter(2, end).getResultList());
        add(amounts, 0, em.createNativeQuery("""
                SELECT payment_method_id, sum(amount) FROM order_payments
                WHERE type IN ('DEPOSIT', 'REFUND') AND coalesce(method_code, '') <> 'WITHHOLDING'
                  AND created_at >= ?1 AND created_at < ?2
                GROUP BY payment_method_id""").setParameter(1, start).setParameter(2, end).getResultList());
        // Sale: gastos y pagos a proveedores.
        add(amounts, 1, em.createNativeQuery("""
                SELECT payment_method_id, sum(amount) FROM expenses
                WHERE status = 'ACTIVE' AND expense_date BETWEEN ?1 AND ?2 GROUP BY payment_method_id""")
                .setParameter(1, Date.valueOf(from)).setParameter(2, Date.valueOf(to)).getResultList());
        add(amounts, 1, em.createNativeQuery("""
                SELECT payment_method_id, sum(amount) FROM supplier_payments
                WHERE paid_at >= ?1 AND paid_at < ?2 GROUP BY payment_method_id""")
                .setParameter(1, start).setParameter(2, end).getResultList());
        // Los egresos de caja sin clasificar también son plata que salió (en efectivo).
        Object unclassified = em.createNativeQuery("""
                SELECT coalesce(-sum(m.amount), 0) FROM cash_movements m
                WHERE m.type = 'EXPENSE' AND m.reference_id IS NULL AND m.created_at >= ?1 AND m.created_at < ?2
                  AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.cash_movement_id = m.id)""")
                .setParameter(1, start).setParameter(2, end).getSingleResult();
        List<?> cashId = em.createNativeQuery("SELECT id FROM payment_methods WHERE code = 'CASH'").getResultList();
        if (!cashId.isEmpty() && money(unclassified).signum() > 0) {
            amounts.computeIfAbsent((UUID) cashId.getFirst(), k -> zero2())[1] =
                    amounts.computeIfAbsent((UUID) cashId.getFirst(), k -> zero2())[1].add(money(unclassified));
        }
        List<MethodFlow> byMethod = new ArrayList<>();
        BigDecimal in = BigDecimal.ZERO;
        BigDecimal out = BigDecimal.ZERO;
        for (Object row : em.createNativeQuery(
                "SELECT id, name, affects_cash FROM payment_methods ORDER BY sort_order, name").getResultList()) {
            Object[] r = (Object[]) row;
            BigDecimal[] v = amounts.get((UUID) r[0]);
            if (v == null || (v[0].signum() == 0 && v[1].signum() == 0)) {
                continue;
            }
            byMethod.add(new MethodFlow((UUID) r[0], (String) r[1], Boolean.TRUE.equals(r[2]), money(v[0]),
                    money(v[1]), money(v[0].subtract(v[1]))));
            in = in.add(v[0]);
            out = out.add(v[1]);
        }
        return new Flow(money(in), money(out), money(in.subtract(out)), byMethod);
    }

    private Balances balances() {
        var c = credit.summary();
        var o = orders.summary();
        Payables p = purchases.payables(null);
        return new Balances(c.totalBalance(), c.customers(), o.balanceDue().max(BigDecimal.ZERO), o.open(),
                p.totalDue(), p.overdue(), p.dueSoon());
    }

    private ExpensesCompare expenses(LocalDate from, LocalDate today, IncomeStatementService.Report month) {
        ExpenseViews.Summary now = expenses.summary(filter(from, today));
        LocalDate[] prev = IncomeStatementService.previous(from, today);
        ExpenseViews.Summary before = expenses.summary(filter(prev[0], prev[1]));
        BigDecimal change = before.total().signum() == 0 ? null
                : now.total().subtract(before.total()).multiply(HUNDRED).divide(before.total(), 1, RoundingMode.HALF_UP);
        List<ExpenseViews.CategoryTotal> top = now.byCategory().stream().limit(3).toList();
        return new ExpensesCompare(now.total(), before.total(), change, top, month.unpaidRecurring().count(),
                month.unpaidRecurring().total());
    }

    private BreakEven breakEven(LocalDate today, BigDecimal monthSales) {
        LocalDate lastMonthStart = today.withDayOfMonth(1).minusMonths(1);
        LocalDate lastMonthEnd = lastMonthStart.withDayOfMonth(lastMonthStart.lengthOfMonth());
        BigDecimal monthly = expenses.summary(filter(lastMonthStart, lastMonthEnd)).total();
        String basis = "LAST_MONTH";
        if (monthly.signum() == 0) {
            // Sin gastos del mes pasado: los fijos prendidos (un quincenal cuenta dos veces al mes).
            Object fixed = em.createNativeQuery("""
                    SELECT coalesce(sum(CASE WHEN frequency = 'BIWEEKLY' THEN amount * 2 ELSE amount END), 0)
                    FROM recurring_expenses WHERE active""").getSingleResult();
            monthly = money(fixed);
            basis = monthly.signum() > 0 ? "RECURRING" : null;
        }
        IncomeStatementService.Statement last30 = statements.report(today.minusDays(29), today, null).current();
        BigDecimal margin = last30.grossMargin();
        BigDecimal average = last30.netSales().divide(BigDecimal.valueOf(30), 0, RoundingMode.HALF_UP);
        if (basis == null || margin == null || margin.signum() <= 0) {
            return new BreakEven(basis, money(monthly), margin, null, null, money(average), money(monthSales), null);
        }
        BigDecimal perMonth = monthly.multiply(HUNDRED).divide(margin, 0, RoundingMode.HALF_UP);
        int days = today.lengthOfMonth();
        BigDecimal perDay = perMonth.divide(BigDecimal.valueOf(days), 0, RoundingMode.HALF_UP);
        BigDecimal target = perDay.multiply(BigDecimal.valueOf(today.getDayOfMonth()));
        return new BreakEven(basis, money(monthly), margin, money(perMonth), money(perDay), money(average),
                money(monthSales), money(target));
    }

    private static ExpenseService.Filter filter(LocalDate from, LocalDate to) {
        return new ExpenseService.Filter(from, to, null, null, null, null, null, false, false, null);
    }

    private static void add(Map<UUID, BigDecimal[]> amounts, int column, List<?> rows) {
        for (Object row : rows) {
            Object[] r = (Object[]) row;
            if (r[0] == null) {
                continue;
            }
            BigDecimal[] v = amounts.computeIfAbsent((UUID) r[0], k -> zero2());
            v[column] = v[column].add(money(r[1]));
        }
    }

    private static BigDecimal[] zero2() {
        return new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO};
    }

    private ZoneId zone() {
        return ZoneId.of(settings.current().timezone());
    }

    private static BigDecimal money(Object value) {
        if (value == null) {
            return BigDecimal.ZERO.setScale(2);
        }
        return (value instanceof BigDecimal d ? d : new BigDecimal(String.valueOf(value))).setScale(2,
                RoundingMode.HALF_UP);
    }
}
