package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.domain.Category;
import com.poshibrido.catalog.domain.Product;
import com.poshibrido.catalog.domain.ProductBarcode;
import com.poshibrido.catalog.domain.Tax;
import com.poshibrido.catalog.domain.Unit;
import com.poshibrido.catalog.infrastructure.CategoryRepository;
import com.poshibrido.catalog.infrastructure.ProductBarcodeRepository;
import com.poshibrido.catalog.infrastructure.ProductRepository;
import com.poshibrido.catalog.infrastructure.PriceListItemRepository;
import com.poshibrido.catalog.infrastructure.PriceListRepository;
import com.poshibrido.catalog.domain.PriceList;
import com.poshibrido.catalog.domain.PriceListItem;
import com.poshibrido.catalog.domain.PriceListItemId;
import com.poshibrido.catalog.infrastructure.TaxRepository;
import com.poshibrido.catalog.infrastructure.UnitRepository;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.csv.CsvReader;
import com.poshibrido.shared.csv.Numbers;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.xlsx.XlsxReader;
import com.poshibrido.shared.xlsx.XlsxWriter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Carga masiva de productos desde CSV (exportable desde Excel). Todo o nada: si alguna fila tiene
 * errores no se escribe nada y se devuelve el reporte. Con {@code dryRun} solo se valida.
 * Un SKU existente se actualiza (nombre, categoría, impuesto, costo, precio, inventario, descripción
 * y se agrega su código de barras si es nuevo).
 */
@Service
@RequiredArgsConstructor
public class ProductImportService {

    public static final int MAX_ROWS = 5000;

    private static final Map<String, String> HEADER_ALIASES = Map.ofEntries(
            Map.entry("sku", "sku"), Map.entry("codigo_interno", "sku"), Map.entry("referencia", "sku"),
            Map.entry("nombre", "nombre"), Map.entry("producto", "nombre"),
            Map.entry("codigo_barras", "codigo_barras"), Map.entry("codigo_de_barras", "codigo_barras"),
            Map.entry("barcode", "codigo_barras"),
            Map.entry("categoria", "categoria"),
            Map.entry("unidad", "unidad"),
            Map.entry("impuesto", "impuesto"),
            Map.entry("costo", "costo"),
            Map.entry("precio", "precio"), Map.entry("precio_venta", "precio"),
            Map.entry("controla_inventario", "controla_inventario"), Map.entry("inventario", "controla_inventario"),
            Map.entry("descripcion", "descripcion"));

    private final ProductRepository products;
    private final ProductBarcodeRepository barcodes;
    private final CategoryRepository categories;
    private final UnitRepository units;
    private final TaxRepository taxes;
    private final AuditLogger audit;
    private final StockPresence stock;
    private final BusinessSettingsApi settings;
    private final PriceListRepository priceLists;
    private final PriceListItemRepository listItems;

    /** Columna "precio_mayorista" → lista MAYORISTA (decisión 381). */
    static final String LIST_PRICE_PREFIX = "precio_";

    public record RowError(int row, String message) {
    }

    /** {@code newPriceLists}: listas de precios que se crean por tener su columna en el archivo (decisión 381). */
    public record ImportReport(int totalRows, int toCreate, int toUpdate, List<String> newCategories,
                               List<RowError> errors, boolean applied, List<String> newPriceLists) {
    }

    /** {@code listPrices}: precio por código de lista; una celda vacía no cambia el precio de esa lista. */
    private record Row(int number, String sku, String name, String description, String barcode, String category,
                       Unit unit, Tax tax, BigDecimal cost, BigDecimal price, boolean trackInventory,
                       Map<String, BigDecimal> listPrices) {
    }

    @Transactional
    public ImportReport importCsv(String content, boolean dryRun) {
        return importRows(CsvReader.parseWithLines(content), dryRun, settings.current().costsIncludeTax());
    }

    /**
     * La misma carga desde una tabla ya armada (primera fila: encabezados), p. ej. lo que se revisó en "Cargar con
     * Aska" (decisión 300). Los costos ya vienen sin IVA (Aska se lo quita si la lista lo trae).
     */
    @Transactional
    public ImportReport importTable(List<List<String>> table, boolean dryRun) {
        List<CsvReader.Row> rows = new ArrayList<>();
        for (int i = 0; i < table.size(); i++) {
            rows.add(new CsvReader.Row(i + 1, table.get(i)));
        }
        return importRows(rows, dryRun, false);
    }

    /** La misma carga desde la plantilla de Excel (.xlsx): se lee la primera hoja (fase 8f). */
    @Transactional
    public ImportReport importXlsx(byte[] content, boolean dryRun) {
        List<XlsxReader.Row> rows;
        try {
            rows = XlsxReader.firstSheet(content);
        } catch (XlsxReader.InvalidXlsxException ex) {
            throw new BusinessRuleException(ex.getMessage());
        }
        return importRows(rows.stream().map(r -> new CsvReader.Row(r.number(), r.cells())).toList(), dryRun,
                settings.current().costsIncludeTax());
    }

    /**
     * Plantilla de Excel para llenar y volver a subir: hoja "Productos" con encabezados, dos ejemplos y listas
     * desplegables (unidad, impuesto, sí/no) con los códigos activos del negocio, y hoja "Instrucciones".
     */
    @Transactional(readOnly = true)
    public byte[] templateXlsx() {
        List<String> unitCodes = units.findAll().stream().filter(Unit::isActive).map(Unit::getCode).sorted().toList();
        List<String> taxCodes = taxes.findAll().stream().filter(Tax::isActive).map(Tax::getCode).sorted().toList();
        // Decisión 381: una columna por cada lista de precios del negocio (precio mayorista, etc.).
        List<String> listColumns = priceLists.findAll().stream().filter(l -> l.isActive() && !l.isDefaultList())
                .map(l -> LIST_PRICE_PREFIX + l.getCode().toLowerCase(Locale.ROOT)).sorted().toList();
        List<String> headers = new ArrayList<>(templateHeaders());
        headers.addAll(listColumns);
        List<String> first = new ArrayList<>(List.of("GAS-400", "Gaseosa cola 400 ml", "7701234567890", "Bebidas",
                "UND", "IVA19", "1200", "2500", "si", ""));
        List<String> second = new ArrayList<>(List.of("ARR-1K", "Arroz 1 kg", "", "Granos", "UND", "IVA5", "3100",
                "4200", "si", "Bolsa de 1 kg"));
        listColumns.forEach(c -> {
            first.add("");
            second.add("");
        });
        List<List<String>> productRows = List.of(headers, first, second);
        List<Integer> widths = new ArrayList<>(List.of(14, 32, 18, 16, 10, 12, 12, 12, 20, 32));
        listColumns.forEach(c -> widths.add(Math.max(16, c.length() + 2)));
        XlsxWriter.Sheet products = new XlsxWriter.Sheet("Productos", productRows,
                widths, Set.of(0, 2),
                Map.of(4, unitCodes, 5, taxCodes, 8, List.of("si", "no")), true);
        List<List<String>> help = List.of(
                List.of("Cómo llenar la plantilla"),
                List.of("1. Escribe un producto por fila en la hoja Productos. Puedes borrar los dos ejemplos."),
                List.of("2. Obligatorias: sku (tu código interno, sin espacios), nombre, impuesto y precio."),
                List.of("3. unidad e impuesto: elige de la lista que aparece al tocar la celda. Si dejas la unidad vacía, queda UND."),
                List.of("4. costo y precio: solo el número, sin $ ni puntos de miles (ej.: 2500)."
                        + (settings.current().costsIncludeTax()
                        ? " El costo, como te lo cobra el proveedor (con IVA): la app le quita el IVA del producto."
                        : " El costo, sin IVA.")),
                List.of("5. controla_inventario: si (lo que tienes en bodega) o no (servicios, bolsas)."),
                List.of("6. Guarda el archivo tal cual (Excel .xlsx) y súbelo en Productos → Importar."),
                List.of("7. Si un sku ya existe, ese producto se actualiza. Las categorías nuevas se crean solas."),
                List.of("8. Precio mayorista u otra lista de precios: una columna precio_ y el código de la lista (por "
                        + "ejemplo precio_mayorista). Si la lista no existe, se crea. Una celda vacía no cambia ese precio."),
                List.of(""),
                List.of("Unidades de tu negocio: " + String.join(", ", unitCodes)),
                List.of("Impuestos de tu negocio: " + String.join(", ", taxCodes)));
        XlsxWriter.Sheet instructions = new XlsxWriter.Sheet("Instrucciones", help, List.of(110), Set.of(), Map.of(),
                true);
        return XlsxWriter.write(List.of(products, instructions));
    }

    /** {@code costWithTax}: la columna costo trae el IVA y se le quita (decisión 348). */
    private ImportReport importRows(List<CsvReader.Row> table, boolean dryRun, boolean costWithTax) {
        if (table.size() < 2) {
            throw new BusinessRuleException("El archivo no tiene filas de productos (la primera fila son los encabezados).");
        }
        if (table.size() - 1 > MAX_ROWS) {
            throw new BusinessRuleException("El archivo supera el máximo de " + MAX_ROWS + " productos por carga.");
        }
        Map<String, Integer> columns = columns(table.getFirst().cells());
        for (String required : List.of("sku", "nombre", "impuesto", "precio")) {
            if (!columns.containsKey(required)) {
                throw new BusinessRuleException("Falta la columna obligatoria '" + required + "'.");
            }
        }
        // Decisión 381: columnas "precio_<lista>" (precio_mayorista → lista MAYORISTA).
        Map<String, Integer> listColumns = listColumns(table.getFirst().cells());
        Map<String, PriceList> listsByCode = priceLists.findAll().stream()
                .collect(Collectors.toMap(PriceList::getCode, Function.identity()));
        Set<String> newPriceLists = new TreeSet<>();
        for (String code : listColumns.keySet()) {
            PriceList list = listsByCode.get(code);
            if (list == null) {
                newPriceLists.add(code);
            } else if (list.isDefaultList()) {
                throw new BusinessRuleException("La columna precio_" + code.toLowerCase(Locale.ROOT)
                        + " es la lista General: ese precio va en la columna 'precio'.");
            } else if (!list.isActive()) {
                throw new BusinessRuleException("La lista de precios " + code + " está inactiva. Actívala o quita su "
                        + "columna del archivo.");
            }
        }

        Map<String, Unit> unitByCode = units.findAll().stream().filter(Unit::isActive)
                .collect(Collectors.toMap(Unit::getCode, Function.identity()));
        Map<String, Tax> taxByCode = taxes.findAll().stream().filter(Tax::isActive)
                .collect(Collectors.toMap(Tax::getCode, Function.identity()));
        Map<String, List<Category>> categoriesByName = categories.findAll().stream().filter(Category::isActive)
                .collect(Collectors.groupingBy(c -> c.getName().trim().toLowerCase(Locale.ROOT)));

        List<RowError> errors = new ArrayList<>();
        List<Row> rows = new ArrayList<>();
        Set<String> skusInFile = new HashSet<>();
        Set<String> barcodesInFile = new HashSet<>();
        for (int i = 1; i < table.size(); i++) {
            int rowNumber = table.get(i).line();
            List<String> cells = table.get(i).cells();
            Row row = parseRow(rowNumber, cells, columns, listColumns, unitByCode, taxByCode, errors);
            if (row == null) {
                continue;
            }
            if (!skusInFile.add(row.sku())) {
                errors.add(new RowError(rowNumber, "El SKU " + row.sku() + " está repetido en el archivo."));
                continue;
            }
            if (row.barcode() != null && !barcodesInFile.add(row.barcode())) {
                errors.add(new RowError(rowNumber, "El código de barras " + row.barcode() + " está repetido en el archivo."));
                continue;
            }
            rows.add(row);
        }

        Map<String, Product> existing = rows.isEmpty() ? Map.of() : products.findBySkusUpper(
                rows.stream().map(Row::sku).toList()).stream()
                .collect(Collectors.toMap(p -> p.getSku().toUpperCase(Locale.ROOT), Function.identity()));
        Map<String, ProductBarcode> existingBarcodes = barcodesInFile.isEmpty() ? Map.of()
                : barcodes.findByBarcodes(barcodesInFile).stream()
                .collect(Collectors.toMap(ProductBarcode::getBarcode, Function.identity()));

        // Sin distinguir mayúsculas: "Bebidas" y "bebidas" son la misma categoría nueva.
        Set<String> newCategories = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        int toCreate = 0;
        int toUpdate = 0;
        for (Row row : rows) {
            Product current = existing.get(row.sku());
            if (current != null && current.isVariant()) {
                errors.add(new RowError(row.number(), "El SKU " + row.sku()
                        + " es una talla de un modelo: cámbialo desde el modelo, no desde la importación."));
                continue;
            }
            if (row.barcode() != null) {
                ProductBarcode owner = existingBarcodes.get(row.barcode());
                if (owner != null && (current == null || !owner.getProduct().getId().equals(current.getId()))) {
                    errors.add(new RowError(row.number(), "El código de barras " + row.barcode()
                            + " ya pertenece al producto " + owner.getProduct().getSku() + "."));
                    continue;
                }
            }
            if (current != null && columns.containsKey("unidad")
                    && !current.getBaseUnitId().equals(row.unit().getId())) {
                errors.add(new RowError(row.number(),
                        "No se puede cambiar la unidad base de un producto existente (" + row.sku() + ")."));
                continue;
            }
            if (row.category() != null) {
                List<Category> matches = categoriesByName.getOrDefault(row.category().toLowerCase(Locale.ROOT), List.of());
                if (matches.size() > 1) {
                    errors.add(new RowError(row.number(), "Hay varias categorías llamadas '" + row.category()
                            + "'. Cambia el nombre de alguna para importar."));
                    continue;
                }
                if (matches.isEmpty()) {
                    newCategories.add(row.category());
                }
            }
            if (current == null) {
                toCreate++;
            } else {
                toUpdate++;
            }
        }

        errors.sort((a, b) -> Integer.compare(a.row(), b.row()));
        boolean apply = !dryRun && errors.isEmpty();
        if (apply) {
            Map<String, Category> createdCategories = new HashMap<>();
            for (String name : newCategories) {
                Category category = categories.save(Category.create(name, null));
                createdCategories.put(name.toLowerCase(Locale.ROOT), category);
            }
            for (String code : newPriceLists) {
                PriceList list = priceLists.save(PriceList.create(code, listName(code)));
                listsByCode.put(code, list);
                audit.log("PRICE_LIST_CREATED", "price_list", list.getId(), null,
                        Map.of("code", code, "name", list.getName(), "by", "importación"));
            }
            for (Row row : rows) {
                Category category = row.category() == null ? null
                        : createdCategories.getOrDefault(row.category().toLowerCase(Locale.ROOT),
                        categoriesByName.getOrDefault(row.category().toLowerCase(Locale.ROOT), List.of()).stream()
                                .findFirst().orElse(null));
                Product product = existing.get(row.sku());
                // En una actualización, las columnas ausentes conservan el valor actual del producto.
                boolean keepUnit = product != null && !columns.containsKey("unidad");
                // Decisión 334: el archivo también cambia el costo de un producto con movimientos (con su renglón en el
                // kardex); sin la columna "costo" se conserva.
                boolean keepCost = product != null && !columns.containsKey("costo");
                BigDecimal oldCost = product == null ? null : product.getCost();
                // Con existencias no se deja de controlar el inventario (QA INV-3): el archivo no lo apaga.
                boolean keepTracking = product != null && (!columns.containsKey("controla_inventario")
                        || (product.isTrackInventory() && !row.trackInventory() && stock.hasStock(product.getId())));
                Product.Data data = new Product.Data(row.sku(), row.name(),
                        row.description() != null ? row.description() : product == null ? null : product.getDescription(),
                        category == null ? (product == null ? null : product.getCategoryId()) : category.getId(),
                        keepUnit ? product.getBaseUnitId() : row.unit().getId(), row.tax().getId(),
                        keepCost ? product.getCost() : netCost(row.cost(), row.tax(), costWithTax), row.price(),
                        keepTracking ? product.isTrackInventory() : row.trackInventory(),
                        // El archivo no trae "precio libre": se conserva lo que tenga el producto.
                        product != null && product.isOpenPrice());
                if (product == null) {
                    product = Product.create(data);
                    if (row.barcode() != null) {
                        product.addBarcodeIfMissing(row.barcode());
                    }
                    products.save(product);
                } else {
                    product.apply(data);
                    if (product.isCostLocked() && oldCost != null
                            && data.cost().setScale(2, RoundingMode.HALF_UP).compareTo(oldCost) != 0) {
                        stock.recordCostChange(product.getId(), oldCost, data.cost().setScale(2, RoundingMode.HALF_UP),
                                ProductService.costReason("por importación", oldCost, data.cost()));
                    }
                    if (row.barcode() != null) {
                        product.addBarcodeIfMissing(row.barcode());
                    }
                }
                setListPrices(product, row.listPrices(), listsByCode);
            }
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("created", toCreate);
            summary.put("updated", toUpdate);
            summary.put("newCategories", newCategories);
            summary.put("priceLists", listColumns.keySet());
            audit.log("PRODUCTS_IMPORTED", "product", null, null, summary);
        }
        return new ImportReport(table.size() - 1, toCreate, toUpdate, List.copyOf(newCategories), errors, apply,
                List.copyOf(newPriceLists));
    }

    /** El precio de cada lista para la unidad base del producto (decisión 381); las listas sin dato no se tocan. */
    private void setListPrices(Product product, Map<String, BigDecimal> prices, Map<String, PriceList> listsByCode) {
        if (prices.isEmpty()) {
            return;
        }
        Map<PriceListItemId, PriceListItem> current = listItems.findByProduct(product.getId()).stream()
                .collect(Collectors.toMap(PriceListItem::getId, Function.identity()));
        prices.forEach((code, price) -> {
            PriceListItemId id = new PriceListItemId(listsByCode.get(code).getId(), product.getId(),
                    product.getBaseUnitId());
            BigDecimal value = price.setScale(2, RoundingMode.HALF_UP);
            PriceListItem item = current.get(id);
            if (item == null) {
                listItems.save(new PriceListItem(id, value));
            } else {
                item.changePrice(value);
            }
        });
    }

    /** "MAYORISTA" → "Mayorista", "CLIENTE_VIP" → "Cliente vip". */
    static String listName(String code) {
        String spaced = code.replace('_', ' ').toLowerCase(Locale.ROOT);
        return Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }

    /** Columnas de precio por lista: "precio_mayorista" → MAYORISTA (no "precio" ni "precio_venta"). */
    static Map<String, Integer> listColumns(List<String> header) {
        Map<String, Integer> result = new LinkedHashMap<>();
        for (int i = 0; i < header.size(); i++) {
            String name = normalizeHeader(header.get(i));
            if (!name.startsWith(LIST_PRICE_PREFIX) || HEADER_ALIASES.containsKey(name)) {
                continue;
            }
            String code = name.substring(LIST_PRICE_PREFIX.length()).toUpperCase(Locale.ROOT);
            if (!code.matches("^[A-Z0-9_]{2,20}$")) {
                throw new BusinessRuleException("La columna '" + header.get(i).trim() + "' no es válida: después de "
                        + "precio_ va el código de la lista (de 2 a 20 letras, números o _), por ejemplo precio_mayorista.");
            }
            if (result.putIfAbsent(code, i) != null) {
                throw new BusinessRuleException("La columna de la lista " + code + " está repetida.");
            }
        }
        return result;
    }

    private Row parseRow(int number, List<String> cells, Map<String, Integer> columns,
                         Map<String, Integer> listColumns, Map<String, Unit> unitByCode,
                         Map<String, Tax> taxByCode, List<RowError> errors) {
        List<String> rowErrors = new ArrayList<>();
        String sku = null;
        try {
            sku = CatalogCodes.sku(cell(cells, columns, "sku"));
        } catch (BusinessRuleException ex) {
            rowErrors.add(ex.getMessage());
        }
        String name = cell(cells, columns, "nombre");
        if (name.isEmpty()) {
            rowErrors.add("Falta el nombre.");
        } else if (name.length() > 200) {
            rowErrors.add("El nombre supera 200 caracteres.");
        }
        String barcode = null;
        String rawBarcode = cell(cells, columns, "codigo_barras");
        if (!rawBarcode.isEmpty()) {
            try {
                barcode = CatalogCodes.barcode(rawBarcode);
            } catch (BusinessRuleException ex) {
                rowErrors.add(ex.getMessage());
            }
        }
        String unitCode = cell(cells, columns, "unidad").toUpperCase(Locale.ROOT);
        Unit unit = unitByCode.get(unitCode.isEmpty() ? "UND" : unitCode);
        if (unit == null) {
            rowErrors.add("La unidad '" + unitCode + "' no existe o está inactiva.");
        }
        String taxCode = cell(cells, columns, "impuesto").toUpperCase(Locale.ROOT);
        Tax tax = taxByCode.get(taxCode);
        if (tax == null) {
            rowErrors.add(taxCode.isEmpty() ? "Falta el impuesto (p. ej. IVA19, IVA5, EXENTO, EXCLUIDO)."
                    : "El impuesto '" + taxCode + "' no existe o está inactivo.");
        }
        BigDecimal price = Numbers.parseFlexible(cell(cells, columns, "precio"));
        if (price == null || price.signum() < 0) {
            rowErrors.add("El precio es obligatorio y no puede ser negativo.");
        }
        String rawCost = cell(cells, columns, "costo");
        BigDecimal cost = rawCost.isEmpty() ? BigDecimal.ZERO : Numbers.parseFlexible(rawCost);
        if (cost == null || cost.signum() < 0) {
            rowErrors.add("El costo no es un número válido.");
        }
        Boolean track = parseBoolean(cell(cells, columns, "controla_inventario"));
        if (track == null) {
            rowErrors.add("controla_inventario debe ser 'si' o 'no'.");
        }
        String description = cell(cells, columns, "descripcion");
        if (description.length() > 500) {
            rowErrors.add("La descripción supera 500 caracteres.");
        }
        String category = cell(cells, columns, "categoria");
        if (category.length() > 120) {
            rowErrors.add("La categoría supera 120 caracteres.");
        }
        Map<String, BigDecimal> listPrices = new LinkedHashMap<>();
        listColumns.forEach((code, index) -> {
            String raw = index >= cells.size() ? "" : cells.get(index).trim();
            if (raw.isEmpty()) {
                return;
            }
            BigDecimal value = Numbers.parseFlexible(raw);
            if (value == null || value.signum() < 0) {
                rowErrors.add("El precio de la lista " + code + " no es un número válido.");
            } else {
                listPrices.put(code, value);
            }
        });
        if (!rowErrors.isEmpty()) {
            errors.add(new RowError(number, String.join(" ", rowErrors)));
            return null;
        }
        return new Row(number, sku, name, description.isEmpty() ? null : description, barcode,
                category.isEmpty() ? null : category, unit, tax, cost, price, track, listPrices);
    }

    private static Map<String, Integer> columns(List<String> header) {
        Map<String, Integer> columns = new HashMap<>();
        for (int i = 0; i < header.size(); i++) {
            String key = HEADER_ALIASES.get(normalizeHeader(header.get(i)));
            if (key != null) {
                columns.putIfAbsent(key, i);
            }
        }
        return columns;
    }

    static String normalizeHeader(String raw) {
        String noAccents = Normalizer.normalize(raw.trim().toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return noAccents.replaceAll("[^a-z0-9]+", "_").replaceAll("^_+|_+$", "");
    }

    private static String cell(List<String> cells, Map<String, Integer> columns, String key) {
        Integer index = columns.get(key);
        return index == null || index >= cells.size() ? "" : cells.get(index).trim();
    }

    private static Boolean parseBoolean(String raw) {
        String value = normalizeHeader(raw);
        if (value.isEmpty() || Set.of("si", "s", "true", "1", "x", "yes").contains(value)) {
            return true;
        }
        if (Set.of("no", "n", "false", "0").contains(value)) {
            return false;
        }
        return null;
    }

    /** Encabezados de la plantilla, en orden. */
    public static List<String> templateHeaders() {
        return List.copyOf(new LinkedHashSet<>(List.of("sku", "nombre", "codigo_barras", "categoria", "unidad",
                "impuesto", "costo", "precio", "controla_inventario", "descripcion")));
    }

    /** Costo sin IVA (decisión 348): si se escribió con IVA y el impuesto lo lleva, se le quita. */
    static BigDecimal netCost(BigDecimal cost, Tax tax, boolean withTax) {
        if (cost == null || !withTax || tax == null || tax.getRate() == null || tax.getRate().signum() <= 0) {
            return cost;
        }
        return cost.divide(BigDecimal.ONE.add(tax.getRate().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP)),
                2, RoundingMode.HALF_UP);
    }
}
