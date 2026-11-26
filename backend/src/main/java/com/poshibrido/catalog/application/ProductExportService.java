package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.xlsx.XlsxWriter;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * "Descargar mis productos" (decisión 382): todos los productos activos en el mismo formato de la plantilla de
 * importación, para corregirlos en Excel y volver a subir el archivo. Trae además el precio de cada lista
 * ({@code precio_mayorista}…) y la existencia por sede, que es solo para consultar: al subirlo no cambia el inventario.
 * <p>
 * El costo sale como se escribe al importar: con IVA si el negocio escribe los costos con IVA (decisión 348), para que
 * subir el mismo archivo no le quite el IVA dos veces.
 */
@Service
@RequiredArgsConstructor
public class ProductExportService {

    /** Columnas de existencia: no empiezan por "precio_" ni son de la plantilla, así que la importación las ignora. */
    static final String STOCK_COLUMN = "existencia";

    private final BusinessSettingsApi settings;
    private final AuditLogger audit;

    @PersistenceContext
    private EntityManager em;

    public record Export(byte[] content, int products) {
    }

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public Export exportXlsx() {
        boolean costWithTax = settings.current().costsIncludeTax();
        List<Object[]> lists = em.createNativeQuery("""
                SELECT id, code FROM price_lists WHERE active AND NOT is_default ORDER BY code""").getResultList();
        List<Object[]> branches = em.createNativeQuery("""
                SELECT id, name FROM branches WHERE active ORDER BY code""").getResultList();
        List<Object[]> products = em.createNativeQuery("""
                SELECT p.id, p.sku, p.name,
                       (SELECT b.barcode FROM product_barcodes b
                        WHERE b.product_id = p.id AND (b.unit_id IS NULL OR b.unit_id = p.base_unit_id)
                        ORDER BY b.internal, b.barcode LIMIT 1) AS barcode,
                       c.name AS category, u.code AS unit, t.code AS tax, t.rate, p.cost, p.sale_price,
                       p.track_inventory, p.description
                FROM products p
                JOIN units u ON u.id = p.base_unit_id
                JOIN taxes t ON t.id = p.tax_id
                LEFT JOIN categories c ON c.id = p.category_id
                WHERE p.deleted_at IS NULL AND p.active
                ORDER BY p.name, p.sku
                """).getResultList();

        // Precio por lista y existencia por sede, de una sola consulta cada uno (sin una consulta por producto).
        Map<UUID, Map<UUID, BigDecimal>> listPrices = new HashMap<>();
        for (Object[] r : (List<Object[]>) em.createNativeQuery("""
                SELECT i.product_id, i.price_list_id, i.price FROM price_list_items i
                JOIN products p ON p.id = i.product_id AND p.base_unit_id = i.unit_id""").getResultList()) {
            listPrices.computeIfAbsent((UUID) r[0], k -> new HashMap<>()).put((UUID) r[1], (BigDecimal) r[2]);
        }
        Map<UUID, Map<UUID, BigDecimal>> stock = new HashMap<>();
        for (Object[] r : (List<Object[]>) em.createNativeQuery("""
                SELECT product_id, branch_id, quantity FROM stock_balances WHERE lot_id IS NULL""").getResultList()) {
            stock.computeIfAbsent((UUID) r[0], k -> new HashMap<>()).put((UUID) r[1], (BigDecimal) r[2]);
        }

        List<String> headers = new ArrayList<>(ProductImportService.templateHeaders());
        lists.forEach(l -> headers.add(ProductImportService.LIST_PRICE_PREFIX + ((String) l[1]).toLowerCase(Locale.ROOT)));
        headers.addAll(stockHeaders(branches.stream().map(b -> (String) b[1]).toList()));

        List<List<String>> rows = new ArrayList<>(products.size() + 1);
        rows.add(headers);
        for (Object[] p : products) {
            UUID id = (UUID) p[0];
            boolean track = (Boolean) p[10];
            List<String> row = new ArrayList<>(headers.size());
            row.add((String) p[1]);
            row.add((String) p[2]);
            row.add(text(p[3]));
            row.add(text(p[4]));
            row.add((String) p[5]);
            row.add((String) p[6]);
            row.add(number(exportCost((BigDecimal) p[8], (BigDecimal) p[7], costWithTax)));
            row.add(number((BigDecimal) p[9]));
            row.add(track ? "si" : "no");
            row.add(text(p[11]));
            Map<UUID, BigDecimal> prices = listPrices.getOrDefault(id, Map.of());
            lists.forEach(l -> row.add(number(prices.get((UUID) l[0]))));
            Map<UUID, BigDecimal> quantities = stock.getOrDefault(id, Map.of());
            branches.forEach(b -> row.add(track ? number(quantities.getOrDefault((UUID) b[0], BigDecimal.ZERO)) : ""));
            rows.add(row);
        }

        List<Integer> widths = new ArrayList<>(List.of(14, 32, 18, 16, 10, 12, 12, 12, 20, 32));
        for (int c = widths.size(); c < headers.size(); c++) {
            widths.add(Math.max(14, headers.get(c).length() + 2));
        }
        List<String> unitCodes = codes("SELECT code FROM units WHERE active ORDER BY code");
        List<String> taxCodes = codes("SELECT code FROM taxes WHERE active ORDER BY code");
        XlsxWriter.Sheet sheet = new XlsxWriter.Sheet("Productos", rows, widths, Set.of(0, 2),
                Map.of(4, unitCodes, 5, taxCodes, 8, List.of("si", "no")), true);
        List<List<String>> help = List.of(
                List.of("Tus productos en Excel"),
                List.of("1. Corrige lo que necesites (precio, costo, categoría, precio mayorista…) y guarda el archivo tal "
                        + "cual (Excel .xlsx)."),
                List.of("2. Súbelo en Productos → Importar desde Excel, toca Revisar y luego Importar. Cada producto se "
                        + "busca por su sku: no cambies el sku."),
                List.of("3. Puedes borrar las filas que no cambiaste: solo se actualizan las que dejes."),
                List.of("4. costo y precio: solo el número, sin $ ni puntos de miles."
                        + (costWithTax ? " El costo sale con IVA, como lo escribes tú: la app le quita el IVA al subirlo."
                        : " El costo, sin IVA.")),
                List.of("5. Una celda vacía en una columna precio_ (por ejemplo precio_mayorista) no cambia ese precio."),
                List.of("6. Las columnas de existencia son solo para consultar: subir el archivo no cambia el inventario. "
                        + "Para corregir cantidades usa Inventario → Conteo."),
                List.of("7. Cada carga recibe hasta " + ProductImportService.MAX_ROWS + " productos."),
                List.of(""),
                List.of("Unidades de tu negocio: " + String.join(", ", unitCodes)),
                List.of("Impuestos de tu negocio: " + String.join(", ", taxCodes)));
        XlsxWriter.Sheet instructions = new XlsxWriter.Sheet("Instrucciones", help, List.of(110), Set.of(), Map.of(),
                true);
        byte[] content = XlsxWriter.write(List.of(sheet, instructions));

        Map<String, Object> exported = new LinkedHashMap<>();
        exported.put("file", "productos.xlsx");
        exported.put("rows", products.size());
        audit.logDetached("PRODUCTS_EXPORTED", "product", null, exported);
        return new Export(content, products.size());
    }

    /** "existencia" con una sola sede; con varias, una columna por sede ("existencia Centro"). */
    static List<String> stockHeaders(List<String> branchNames) {
        if (branchNames.size() == 1) {
            return List.of(STOCK_COLUMN);
        }
        return branchNames.stream().map(n -> STOCK_COLUMN + " " + n.trim()).toList();
    }

    /** Lo contrario de {@link ProductImportService#netCost}: el costo con IVA, redondeado a pesos con centavos. */
    static BigDecimal exportCost(BigDecimal cost, BigDecimal rate, boolean withTax) {
        if (cost == null || !withTax || rate == null || rate.signum() <= 0) {
            return cost;
        }
        return cost.multiply(BigDecimal.ONE.add(rate.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP)))
                .setScale(2, RoundingMode.HALF_UP);
    }

    /** 2500.00 → "2500"; 0.50 → "0.5" (Excel lo lee como número). */
    static String number(BigDecimal value) {
        return value == null ? "" : value.stripTrailingZeros().toPlainString();
    }

    private static String text(Object value) {
        return value == null ? "" : value.toString();
    }

    @SuppressWarnings("unchecked")
    private List<String> codes(String sql) {
        return (List<String>) em.createNativeQuery(sql).getResultList();
    }
}
