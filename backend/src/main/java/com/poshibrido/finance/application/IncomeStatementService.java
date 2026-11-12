package com.poshibrido.finance.application;

import com.poshibrido.finance.application.ExpenseViews.CategoryTotal;
import com.poshibrido.finance.application.RecurringExpenseService.DueSummary;
import com.poshibrido.organization.application.BranchApi;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.csv.CsvWriter;
import com.poshibrido.shared.error.BusinessRuleException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Estado de resultados (Finanzas parte C, decisión 323). Ventas netas (sin impuestos, como la utilidad de Reportes) −
 * costo de lo vendido = utilidad bruta; − gastos por categoría = utilidad operativa. El IVA cobrado y las retenciones
 * van aparte: no son ingresos ni gastos del negocio. Se compara con el periodo anterior (el mes anterior si el periodo
 * empieza el día 1) y con el mismo periodo del año pasado, si tiene datos.
 */
@Service
@RequiredArgsConstructor
public class IncomeStatementService {

    static final int MAX_DAYS = 400;
    private static final BigDecimal HUNDRED = new BigDecimal("100");

    @PersistenceContext
    private EntityManager em;

    private final ExpenseService expenses;
    private final WithholdingService withholdings;
    private final RecurringExpenseService recurring;
    private final BusinessSettingsApi settings;
    private final BranchApi branches;

    public record Line(UUID categoryId, String name, BigDecimal amount) {
    }

    /**
     * Un periodo. {@code grossMargin} y {@code operatingMargin}: porcentaje de las ventas netas (nulo sin ventas).
     * {@code withheld}: retenciones del periodo (nulo cuando se filtra por sede: las de pedidos no tienen sede).
     */
    public record Statement(LocalDate from, LocalDate to, long salesCount, BigDecimal salesTotal, BigDecimal tax,
                            BigDecimal netSales, BigDecimal cost, BigDecimal grossProfit, BigDecimal grossMargin,
                            List<Line> expenses, BigDecimal expensesTotal, BigDecimal operatingProfit,
                            BigDecimal operatingMargin, BigDecimal withheld, boolean hasData) {
    }

    /** Gastos fijos del periodo sin pagar: no se restan, se avisan. */
    public record Unpaid(int count, BigDecimal total) {
    }

    public record Report(UUID branchId, String branchName, Statement current, Statement previous, Statement lastYear,
                         Unpaid unpaidRecurring) {
    }

    @Transactional(readOnly = true)
    public Report report(LocalDate from, LocalDate to, UUID branchId) {
        LocalDate today = LocalDate.now(zone());
        LocalDate start = from == null ? today.withDayOfMonth(1) : from;
        LocalDate end = to == null ? (from == null ? today : start.withDayOfMonth(start.lengthOfMonth())) : to;
        if (start.isAfter(end)) {
            throw new BusinessRuleException("La fecha inicial no puede ser posterior a la final.");
        }
        if (ChronoUnit.DAYS.between(start, end) > MAX_DAYS) {
            throw new BusinessRuleException("El periodo puede ser de máximo " + MAX_DAYS + " días.");
        }
        String branchName = null;
        if (branchId != null) {
            branchName = branches.findByIds(List.of(branchId)).stream().findFirst()
                    .orElseThrow(() -> new BusinessRuleException("Sede no encontrada.")).name();
        }
        Statement current = statement(start, end, branchId);
        LocalDate[] prev = previous(start, end);
        Statement previous = statement(prev[0], prev[1], branchId);
        Statement lastYear = statement(start.minusYears(1), end.minusYears(1), branchId);
        DueSummary unpaid = recurring.unpaidBetween(start, end);
        return new Report(branchId, branchName, current, previous.hasData() ? previous : null,
                lastYear.hasData() ? lastYear : null, new Unpaid(unpaid.count(), unpaid.total()));
    }

    /** Periodo anterior: el mismo tramo del mes anterior si empieza el día 1; si no, los días justo antes. */
    static LocalDate[] previous(LocalDate from, LocalDate to) {
        if (from.getDayOfMonth() == 1 && from.getYear() == to.getYear() && from.getMonth() == to.getMonth()) {
            LocalDate prevFrom = from.minusMonths(1);
            boolean fullMonth = to.getDayOfMonth() == to.lengthOfMonth();
            LocalDate prevTo = fullMonth ? prevFrom.withDayOfMonth(prevFrom.lengthOfMonth())
                    : prevFrom.withDayOfMonth(Math.min(to.getDayOfMonth(), prevFrom.lengthOfMonth()));
            return new LocalDate[] {prevFrom, prevTo};
        }
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        return new LocalDate[] {from.minusDays(days), from.minusDays(1)};
    }

    private Statement statement(LocalDate from, LocalDate to, UUID branchId) {
        ZoneId zone = zone();
        Object[] s = (Object[]) em.createNativeQuery("""
                WITH filtered AS (
                    SELECT s.* FROM sales s
                    WHERE s.status = 'COMPLETED' AND s.created_at >= :start AND s.created_at < :end
                      AND (CAST(:branch AS uuid) IS NULL OR s.branch_id = CAST(:branch AS uuid))
                ), costs AS (
                    SELECT si.sale_id, sum(si.unit_cost * si.base_quantity) AS cost
                    FROM sale_items si JOIN filtered f ON f.id = si.sale_id GROUP BY si.sale_id
                )
                SELECT count(*), coalesce(sum(f.total), 0), coalesce(sum(f.tax_total), 0), coalesce(sum(f.subtotal), 0),
                       coalesce(round(sum(c.cost), 2), 0)
                FROM filtered f LEFT JOIN costs c ON c.sale_id = f.id""")
                .setParameter("start", Timestamp.from(from.atStartOfDay(zone).toInstant()))
                .setParameter("end", Timestamp.from(to.plusDays(1).atStartOfDay(zone).toInstant()))
                .setParameter("branch", branchId == null ? null : branchId.toString())
                .getSingleResult();
        long count = ((Number) s[0]).longValue();
        BigDecimal net = money(s[3]);
        BigDecimal cost = money(s[4]);
        BigDecimal gross = net.subtract(cost);
        ExpenseViews.Summary e = expenses.summary(new ExpenseService.Filter(from, to, null, branchId, null, null, null,
                false, false, null));
        List<Line> lines = new ArrayList<>();
        for (CategoryTotal c : e.byCategory()) {
            lines.add(new Line(c.categoryId(), c.name(), c.total()));
        }
        BigDecimal operating = gross.subtract(e.total());
        BigDecimal withheld = branchId != null ? null : withholdings.summary(
                new WithholdingService.Filter(from, to, null, null, null, false)).total();
        boolean hasData = count > 0 || e.count() > 0;
        return new Statement(from, to, count, money(s[1]), money(s[2]), net, cost, gross, margin(gross, net), lines,
                e.total(), operating, margin(operating, net), withheld, hasData);
    }

    /** Para Excel: una fila por concepto con el periodo y sus comparaciones. */
    @Transactional(readOnly = true)
    public CsvWriter csv(Report r) {
        CsvWriter csv = new CsvWriter(zone());
        Statement c = r.current();
        Statement p = r.previous();
        Statement y = r.lastYear();
        csv.row("Estado de resultados", c.from() + " a " + c.to(), r.branchName() == null ? "Todas las sedes"
                : "Sede " + r.branchName());
        csv.row("Concepto", "Este periodo", p == null ? "Periodo anterior (sin datos)" : "Periodo anterior "
                + p.from() + " a " + p.to(), y == null ? "Año pasado (sin datos)" : "Año pasado " + y.from() + " a "
                + y.to());
        row(csv, "Ventas netas (sin impuestos)", c, p, y, Statement::netSales);
        row(csv, "Costo de lo vendido", c, p, y, Statement::cost);
        row(csv, "Utilidad bruta", c, p, y, Statement::grossProfit);
        Map<String, BigDecimal[]> byCategory = new LinkedHashMap<>();
        collect(byCategory, c, 0);
        collect(byCategory, p, 1);
        collect(byCategory, y, 2);
        byCategory.forEach((name, v) -> csv.row("Gasto: " + name, v[0], v[1], v[2]));
        row(csv, "Total gastos", c, p, y, Statement::expensesTotal);
        row(csv, "Utilidad operativa", c, p, y, Statement::operatingProfit);
        row(csv, "Impuestos cobrados (aparte)", c, p, y, Statement::tax);
        row(csv, "Retenciones que te hicieron (aparte)", c, p, y, Statement::withheld);
        if (r.unpaidRecurring().count() > 0) {
            csv.row("Gastos fijos del periodo sin pagar (no restados)", r.unpaidRecurring().total(), null, null);
        }
        return csv;
    }

    private static void collect(Map<String, BigDecimal[]> map, Statement s, int column) {
        if (s == null) {
            return;
        }
        for (Line l : s.expenses()) {
            map.computeIfAbsent(l.name(), k -> new BigDecimal[3])[column] = l.amount();
        }
    }

    private static void row(CsvWriter csv, String label, Statement c, Statement p, Statement y,
                            java.util.function.Function<Statement, BigDecimal> value) {
        csv.row(label, value.apply(c), p == null ? null : value.apply(p), y == null ? null : value.apply(y));
    }

    private static BigDecimal margin(BigDecimal value, BigDecimal base) {
        return base.signum() == 0 ? null : value.multiply(HUNDRED).divide(base, 1, RoundingMode.HALF_UP);
    }

    private ZoneId zone() {
        return ZoneId.of(settings.current().timezone());
    }

    private static BigDecimal money(Object value) {
        return (value instanceof BigDecimal d ? d : new BigDecimal(String.valueOf(value))).setScale(2,
                RoundingMode.HALF_UP);
    }
}
