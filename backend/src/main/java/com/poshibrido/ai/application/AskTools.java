package com.poshibrido.ai.application;

import com.poshibrido.cash.application.CashQueryService;
import com.poshibrido.cash.domain.CashSessionStatus;
import com.poshibrido.credit.application.CreditQueryService;
import com.poshibrido.finance.application.ExpenseService;
import com.poshibrido.finance.application.FinanceDashboardService;
import com.poshibrido.finance.application.IncomeStatementService;
import com.poshibrido.finance.application.WithholdingService;
import com.poshibrido.inventory.application.InventoryQueryService;
import com.poshibrido.inventory.application.LotQueryService;
import com.poshibrido.organization.application.BranchService;
import com.poshibrido.organization.domain.Branch;
import com.poshibrido.purchasing.application.PurchaseService;
import com.poshibrido.reporting.application.ReportFilter;
import com.poshibrido.reporting.application.ReportQueryService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.BiFunction;

/**
 * Herramientas de "Pregúntale a tu negocio" (decisión 296): consultas de SOLO LECTURA sobre los mismos servicios de
 * los reportes. Cada una pide el permiso que pide su pantalla: a quien no lo tiene ni siquiera se le ofrece a la IA, y
 * si la IA la pide igual, se niega. Los resultados se recortan (pocas filas, máximo {@link #MAX_RESULT} caracteres).
 */
@Component
@RequiredArgsConstructor
public class AskTools {

    static final int MAX_RESULT = 8000;

    private final ReportQueryService reports;
    private final InventoryQueryService inventory;
    private final LotQueryService lots;
    private final CreditQueryService credit;
    private final PurchaseService purchases;
    private final CashQueryService cash;
    private final BranchService branches;
    private final ExpenseService expenses;
    private final IncomeStatementService incomeStatement;
    private final FinanceDashboardService financeDashboard;
    private final WithholdingService withholdings;

    @PersistenceContext
    private EntityManager em;

    /** Una herramienta: nombre, permiso que pide (nulo = cualquiera), etiqueta para la pantalla y esquema. */
    record Tool(String name, String permission, String label, String description, Map<String, Object> schema,
                BiFunction<AskTools, Map<String, Object>, Object> run) {
    }

    private static final Map<String, Object> DESDE = Map.of("type", "string",
            "description", "Fecha inicial AAAA-MM-DD (incluida). Sin ella, hoy.");
    private static final Map<String, Object> HASTA = Map.of("type", "string",
            "description", "Fecha final AAAA-MM-DD (incluida). Sin ella, igual a desde o hoy.");
    private static final Map<String, Object> SUCURSAL = Map.of("type", "string",
            "description", "Nombre o código de la sucursal. Sin ella, todas.");
    private static final Map<String, Object> DESDE_MES = Map.of("type", "string",
            "description", "Fecha inicial AAAA-MM-DD (incluida). Sin ella, el primer día del mes en curso.");
    private static final Map<String, Object> HASTA_MES = Map.of("type", "string",
            "description", "Fecha final AAAA-MM-DD (incluida). Sin ella, hoy.");

    static final List<Tool> TOOLS = List.of(
            new Tool("sucursales", null, "Sucursales", "Lista las sucursales activas del negocio.",
                    schema(Map.of()), (t, in) -> t.branchList()),
            new Tool("resumen_ventas", "reports:read", "Resumen de ventas",
                    "Totales de ventas en un rango: cantidad de ventas, total, base, impuestos, descuentos, ticket "
                            + "promedio, costo, utilidad, margen y anuladas.",
                    schema(Map.of("desde", DESDE, "hasta", HASTA, "sucursal", SUCURSAL)),
                    (t, in) -> t.reports.summary(t.filter(in))),
            new Tool("ventas_agrupadas", "reports:read", "Ventas agrupadas",
                    "Ventas de un rango agrupadas por día, sucursal, vendedor, medio de pago o categoría.",
                    schema(Map.of("agrupar", Map.of("type", "string",
                                    "enum", List.of("dia", "sucursal", "vendedor", "medio_pago", "categoria")),
                            "desde", DESDE, "hasta", HASTA, "sucursal", SUCURSAL), "agrupar"),
                    (t, in) -> t.grouped(in)),
            new Tool("producto", "reports:read", "Ficha del producto",
                    "Precio de venta, costo, margen, existencia total y ventas de 7 y 30 días (unidades y precio "
                            + "promedio cobrado) de los productos que coinciden con un texto. Úsala para preguntas de "
                            + "precios, promociones o si un producto deja ganancia.",
                    schema(Map.of("buscar", Map.of("type", "string", "description", "Nombre o SKU del producto.")), "buscar"),
                    (t, in) -> t.product(in)),
            new Tool("productos_vendidos", "reports:read", "Productos más vendidos",
                    "Productos más vendidos en un rango, por valor o por cantidad, con costo y utilidad.",
                    schema(Map.of("desde", DESDE, "hasta", HASTA, "sucursal", SUCURSAL,
                            "ordenar", Map.of("type", "string", "enum", List.of("valor", "cantidad")),
                            "limite", Map.of("type", "integer", "description", "De 1 a 30; 10 si no se indica."))),
                    (t, in) -> t.reports.topProducts(t.filter(in), clamp(integer(in.get("limite"), 10), 1, 30),
                            "cantidad".equals(in.get("ordenar")))),
            new Tool("mis_ventas_hoy", "sales:read", "Mis ventas de hoy",
                    "Las ventas de hoy de quien pregunta: cantidad, total, ticket promedio y medios de pago.",
                    schema(Map.of()), (t, in) -> t.reports.myDay(com.poshibrido.shared.security.CurrentActor.requireUserId())),
            new Tool("existencias", "inventory:read", "Existencias",
                    "Existencia, mínimo y costo promedio de los productos que coinciden con un texto (nombre, SKU o "
                            + "código de barras), por sucursal.",
                    schema(Map.of("buscar", Map.of("type", "string", "description", "Nombre, SKU o código."),
                            "sucursal", SUCURSAL), "buscar"),
                    (t, in) -> t.stock(in)),
            new Tool("bajo_minimo", "inventory:read", "Productos bajo el mínimo",
                    "Productos que están en su mínimo o por debajo (para pedir).",
                    schema(Map.of("sucursal", SUCURSAL)),
                    (t, in) -> first(t.inventory.alerts(t.branch(in)), 50)),
            new Tool("vencimientos", "inventory:read", "Vencimientos",
                    "Lotes vencidos o por vencer con su existencia y valor, los que vencen primero arriba.",
                    schema(Map.of("estado", Map.of("type", "string", "enum", List.of("vencidos", "por_vencer")),
                            "sucursal", SUCURSAL), "estado"),
                    (t, in) -> t.lots.lots(t.branch(in), "vencidos".equals(in.get("estado"))
                            ? LotQueryService.LotStatus.EXPIRED : LotQueryService.LotStatus.EXPIRING, null, 0, 50)),
            new Tool("sin_rotacion", "reports:read", "Productos sin rotación",
                    "Productos con existencia que no se venden hace N días, con el valor quieto.",
                    schema(Map.of("dias", Map.of("type", "integer", "description", "De 30 a 365; 90 si no se indica."),
                            "sucursal", SUCURSAL)),
                    (t, in) -> t.slowMovers(in)),
            new Tool("inventario_valorizado", "reports:read", "Inventario valorizado",
                    "Valor total del inventario a costo promedio y los productos que más valen.",
                    schema(Map.of("sucursal", SUCURSAL)), (t, in) -> t.valuation(in)),
            new Tool("fiados", "credit:read", "Fiados",
                    "Cuánto deben los clientes (total y por antigüedad) y quiénes deben más; con buscar, un cliente.",
                    schema(Map.of("buscar", Map.of("type", "string", "description", "Nombre o documento del cliente."))),
                    (t, in) -> t.credit(in)),
            new Tool("cuentas_por_pagar", "purchases:read", "Cuentas por pagar",
                    "Lo que se le debe a los proveedores: total, vencido, lo que vence en 7 días y las facturas.",
                    schema(Map.of()), (t, in) -> t.payables()),
            new Tool("cajas", "cash:read", "Cajas",
                    "Turnos de caja abiertos o cerrados en un rango, con lo esperado, lo contado y la diferencia.",
                    schema(Map.of("estado", Map.of("type", "string", "enum", List.of("abiertas", "cerradas")),
                            "desde", DESDE, "hasta", HASTA, "sucursal", SUCURSAL)),
                    (t, in) -> t.cashSessions(in)),
            // Finanzas (decisión 325).
            new Tool("gastos", "expenses:read", "Gastos",
                    "Gastos registrados en un rango (sin los anulados): total, cuánto salió de la caja, por categoría, "
                            + "por medio de pago y los más grandes. Con buscar, solo los que coinciden en nota, "
                            + "proveedor o referencia.",
                    schema(Map.of("desde", DESDE_MES, "hasta", HASTA_MES, "sucursal", SUCURSAL,
                            "buscar", Map.of("type", "string", "description", "Texto a buscar en los gastos."))),
                    (t, in) -> t.expenseReport(in)),
            new Tool("estado_resultados", "finance:read", "Estado de resultados",
                    "Ganancia del negocio en un rango: ventas sin IVA, costo de lo vendido, utilidad bruta, gastos "
                            + "por categoría y utilidad operativa, comparado con el periodo anterior y el mismo "
                            + "periodo del año pasado. Avisa los gastos fijos sin pagar del periodo.",
                    schema(Map.of("desde", DESDE_MES, "hasta", HASTA_MES, "sucursal", SUCURSAL)),
                    (t, in) -> t.incomeStatement.report(date(in.get("desde")), date(in.get("hasta")), t.branch(in))),
            new Tool("tablero_finanzas", "finance:read", "Tablero de finanzas y punto de equilibrio",
                    "El mes en curso: ventas, utilidad, flujo de dinero (entradas y salidas por medio de pago), lo "
                            + "que deben los clientes (fiados y pedidos), lo que se debe a proveedores, gastos contra "
                            + "el mes pasado, gastos fijos por pagar y el punto de equilibrio (cuánto hay que vender "
                            + "al mes y al día para cubrir los gastos).",
                    schema(Map.of()), (t, in) -> t.financeDashboard.dashboard()),
            new Tool("retenciones", "finance:read", "Retenciones",
                    "Retenciones que los clientes le hicieron al negocio en un rango: total por tipo (retefuente, "
                            + "reteIVA, reteICA), por cliente y los certificados que faltan por recibir.",
                    schema(Map.of("desde", DESDE_MES, "hasta", HASTA_MES)),
                    (t, in) -> t.withholdings.summary(new WithholdingService.Filter(date(in.get("desde")),
                            date(in.get("hasta")), null, null, null, false))));

    /** Las herramientas que la persona puede usar, en el formato de la API. */
    public List<Map<String, Object>> definitions(Set<String> permissions) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Tool tool : TOOLS) {
            if (allowed(tool, permissions)) {
                list.add(Map.of("name", tool.name(), "description", tool.description(), "input_schema", tool.schema()));
            }
        }
        return list;
    }

    /** Etiqueta para mostrar qué se consultó. */
    public static String label(String name) {
        return TOOLS.stream().filter(t -> t.name().equals(name)).map(Tool::label).findFirst().orElse(name);
    }

    /** Resultado de una herramienta como texto para la IA. {@code error}: el texto explica el problema. */
    public record Outcome(String content, boolean error) {
    }

    public Outcome run(String name, Map<String, Object> input, Set<String> permissions) {
        Tool tool = TOOLS.stream().filter(t -> t.name().equals(name)).findFirst().orElse(null);
        if (tool == null) {
            return new Outcome("No existe esa consulta.", true);
        }
        if (!allowed(tool, permissions)) {
            return new Outcome("Quien pregunta no tiene permiso para ver esto en XASKA. Díselo con amabilidad.", true);
        }
        try {
            String json = AnthropicMessages.JSON.writeValueAsString(tool.run().apply(this, input == null ? Map.of() : input));
            return new Outcome(json.length() > MAX_RESULT ? json.substring(0, MAX_RESULT) + "…(recortado)" : json, false);
        } catch (IllegalArgumentException ex) {
            return new Outcome(ex.getMessage(), true);
        } catch (RuntimeException ex) {
            String message = ex.getMessage() == null ? "No se pudo consultar." : ex.getMessage();
            return new Outcome("No se pudo consultar: " + message, true);
        }
    }

    static boolean allowed(Tool tool, Set<String> permissions) {
        return tool.permission() == null || permissions.contains(tool.permission());
    }

    // ------------------------------------------------------------------ consultas

    private List<Map<String, Object>> branchList() {
        return activeBranches().stream().map(b -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("codigo", b.getCode());
            m.put("nombre", b.getName());
            return m;
        }).toList();
    }

    private Object product(Map<String, Object> in) {
        String search = text(in.get("buscar"));
        if (search == null) {
            throw new IllegalArgumentException("Falta qué producto buscar.");
        }
        ZoneId zone = reports.zone();
        LocalDate today = LocalDate.now(zone);
        Instant d7 = today.minusDays(7).atStartOfDay(zone).toInstant();
        Instant d30 = today.minusDays(30).atStartOfDay(zone).toInstant();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                SELECT p.sku, p.name, u.code, p.sale_price, p.cost,
                       coalesce((SELECT sum(b.quantity) FROM stock_balances b
                                 WHERE b.product_id = p.id AND b.lot_id IS NULL), 0),
                       coalesce(x.q7, 0), coalesce(x.t7, 0), coalesce(x.q30, 0), coalesce(x.t30, 0)
                FROM products p
                JOIN units u ON u.id = p.base_unit_id
                LEFT JOIN LATERAL (
                    SELECT sum(si.base_quantity) FILTER (WHERE s.created_at >= ?3) AS q7,
                           sum(si.total) FILTER (WHERE s.created_at >= ?3) AS t7,
                           sum(si.base_quantity) AS q30, sum(si.total) AS t30
                    FROM sale_items si JOIN sales s ON s.id = si.sale_id
                    WHERE si.product_id = p.id AND s.status = 'COMPLETED' AND s.created_at >= ?2) x ON TRUE
                WHERE p.active AND (p.name ILIKE ?1 OR p.sku ILIKE ?1)
                ORDER BY p.name LIMIT 10""")
                .setParameter(1, "%" + search.replace("%", "").replace("_", "") + "%")
                .setParameter(2, Timestamp.from(d30)).setParameter(3, Timestamp.from(d7)).getResultList();
        if (rows.isEmpty()) {
            return "No hay productos activos con \"" + search + "\".";
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object[] r : rows) {
            BigDecimal price = decimal(r[3]);
            BigDecimal cost = decimal(r[4]);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("sku", r[0]);
            m.put("producto", r[1]);
            m.put("unidad", r[2]);
            m.put("precioVenta", price);
            m.put("costo", cost);
            m.put("margenPorcentaje", price.signum() == 0 ? null
                    : price.subtract(cost).multiply(BigDecimal.valueOf(100)).divide(price, 1, RoundingMode.HALF_UP));
            m.put("existenciaTotal", decimal(r[5]));
            m.put("vendido7dias", decimal(r[6]));
            m.put("cobrado7dias", decimal(r[7]));
            m.put("vendido30dias", decimal(r[8]));
            m.put("cobrado30dias", decimal(r[9]));
            BigDecimal q30 = decimal(r[8]);
            m.put("precioPromedioCobrado30dias", q30.signum() == 0 ? null
                    : decimal(r[9]).divide(q30, 0, RoundingMode.HALF_UP));
            out.add(m);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("nota", "precioVenta es el de la ficha (con IVA si el negocio vende con IVA incluido); lo cobrado "
                + "incluye descuentos e impuestos.");
        result.put("productos", out);
        return result;
    }

    private static BigDecimal decimal(Object o) {
        return o == null ? BigDecimal.ZERO : o instanceof BigDecimal b ? b : new BigDecimal(o.toString());
    }

    private Object grouped(Map<String, Object> in) {
        ReportFilter f = filter(in);
        return switch (String.valueOf(in.get("agrupar"))) {
            case "dia" -> reports.byDay(f);
            case "sucursal" -> reports.byBranch(f);
            case "vendedor" -> reports.bySeller(f);
            case "medio_pago" -> reports.byPaymentMethod(f);
            case "categoria" -> reports.byCategory(f);
            default -> throw new IllegalArgumentException("agrupar debe ser dia, sucursal, vendedor, medio_pago o categoria.");
        };
    }

    private Object stock(Map<String, Object> in) {
        String search = text(in.get("buscar"));
        if (search == null) {
            throw new IllegalArgumentException("Falta qué producto buscar.");
        }
        UUID only = branch(in);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Branch b : activeBranches()) {
            if (only != null && !only.equals(b.getId())) {
                continue;
            }
            for (var r : inventory.stock(b.getId(), search, null, PageRequest.of(0, 15, Sort.by("name"))).getContent()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("sucursal", b.getName());
                m.put("sku", r.sku());
                m.put("producto", r.name());
                m.put("unidad", r.unitCode());
                m.put("existencia", r.quantity());
                m.put("minimo", r.minStock());
                m.put("estado", r.status());
                m.put("costoPromedio", r.averageCost());
                rows.add(m);
            }
        }
        return rows.isEmpty() ? "No hay productos con \"" + search + "\"." : first(rows, 40);
    }

    private Object slowMovers(Map<String, Object> in) {
        var slow = reports.slowMovers(branch(in), clamp(integer(in.get("dias"), 90), 30, 365));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("dias", slow.days());
        m.put("productos", slow.productCount());
        m.put("valorQuieto", slow.totalValue());
        m.put("masValiosos", slow.rows().stream()
                .sorted((a, b) -> b.value().compareTo(a.value())).limit(25).toList());
        return m;
    }

    private Object valuation(Map<String, Object> in) {
        var v = reports.inventoryValuation(branch(in));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("valorTotal", v.totalValue());
        m.put("productos", v.productCount());
        m.put("masValiosos", v.rows().stream().sorted((a, b) -> b.value().compareTo(a.value())).limit(20).toList());
        return m;
    }

    private Object credit(Map<String, Object> in) {
        Map<String, Object> m = new LinkedHashMap<>();
        String search = text(in.get("buscar"));
        if (search == null) {
            m.put("resumen", credit.summary());
        }
        m.put("clientes", credit.accounts(search, CreditQueryService.Filter.DEBT, 0, 20).content());
        return m;
    }

    private Object payables() {
        var p = purchases.payables(null);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("totalDebido", p.totalDue());
        m.put("vencido", p.overdue());
        m.put("venceEn7Dias", p.dueSoon());
        m.put("facturas", first(p.receipts(), 25));
        return m;
    }

    private Object cashSessions(Map<String, Object> in) {
        CashSessionStatus status = "abiertas".equals(in.get("estado")) ? CashSessionStatus.OPEN
                : "cerradas".equals(in.get("estado")) ? CashSessionStatus.CLOSED : null;
        LocalDate from = date(in.get("desde"));
        LocalDate to = date(in.get("hasta"));
        return cash.search(null, branch(in), status, null, from, to == null ? from : to, 0, 20).getContent();
    }

    private Object expenseReport(Map<String, Object> in) {
        ExpenseService.Filter f = expenses.normalize(new ExpenseService.Filter(date(in.get("desde")),
                date(in.get("hasta")), null, branch(in), null, null, null, false, false, text(in.get("buscar"))));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("resumen", expenses.summary(f));
        m.put("masGrandes", expenses.list(f, 0, 100).content().stream()
                .sorted((a, b) -> b.amount().compareTo(a.amount())).limit(15).map(e -> {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("fecha", e.date());
                    r.put("categoria", e.categoryName() == null ? "Sin clasificar" : e.categoryName());
                    r.put("valor", e.amount());
                    r.put("medioPago", e.paymentMethodName());
                    r.put("salioDeCaja", e.fromCash());
                    r.put("proveedor", e.supplierName());
                    r.put("nota", e.note());
                    return r;
                }).toList());
        return m;
    }

    // ------------------------------------------------------------------ apoyo

    ReportFilter filter(Map<String, Object> in) {
        LocalDate from = date(in.get("desde"));
        LocalDate to = date(in.get("hasta"));
        if (to == null) {
            to = from;
        }
        return new ReportFilter(reports.period(from, to), branch(in), null);
    }

    private List<Branch> activeBranches() {
        return branches.list(PageRequest.of(0, 100, Sort.by("code"))).getContent().stream().filter(Branch::isActive).toList();
    }

    /** La sucursal por nombre o código (sin distinguir mayúsculas); nula = todas. */
    UUID branch(Map<String, Object> in) {
        String wanted = text(in.get("sucursal"));
        if (wanted == null) {
            return null;
        }
        String w = wanted.toLowerCase(Locale.ROOT);
        List<Branch> all = activeBranches();
        return all.stream().filter(b -> b.getCode().equalsIgnoreCase(wanted) || b.getName().equalsIgnoreCase(wanted))
                .findFirst()
                .or(() -> all.stream().filter(b -> b.getName().toLowerCase(Locale.ROOT).contains(w)).findFirst())
                .map(Branch::getId)
                .orElseThrow(() -> new IllegalArgumentException("No hay una sucursal \"" + wanted + "\". Las sucursales son: "
                        + String.join(", ", all.stream().map(Branch::getName).toList()) + "."));
    }

    static LocalDate date(Object value) {
        String s = text(value);
        if (s == null) {
            return null;
        }
        try {
            return LocalDate.parse(s);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("La fecha \"" + s + "\" no es AAAA-MM-DD.");
        }
    }

    private static String text(Object value) {
        return value == null || String.valueOf(value).isBlank() ? null : String.valueOf(value).trim();
    }

    private static int integer(Object value, int fallback) {
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return value == null ? fallback : Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }

    private static <T> List<T> first(List<T> list, int n) {
        return list.size() <= n ? list : list.subList(0, n);
    }

    private static Map<String, Object> schema(Map<String, Object> properties, String... required) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("type", "object");
        s.put("properties", properties);
        if (required.length > 0) {
            s.put("required", List.of(required));
        }
        return s;
    }
}
