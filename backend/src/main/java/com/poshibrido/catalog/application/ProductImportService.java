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
import com.poshibrido.catalog.infrastructure.TaxRepository;
import com.poshibrido.catalog.infrastructure.UnitRepository;
import com.poshibrido.shared.csv.CsvReader;
import com.poshibrido.shared.csv.Numbers;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.xlsx.XlsxReader;
import com.poshibrido.shared.xlsx.XlsxWriter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
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

    public record RowError(int row, String message) {
    }

    public record ImportReport(int totalRows, int toCreate, int toUpdate, List<String> newCategories,
                               List<RowError> errors, boolean applied) {
    }

    private record Row(int number, String sku, String name, String description, String barcode, String category,
                       Unit unit, Tax tax, BigDecimal cost, BigDecimal price, boolean trackInventory) {
    }

    @Transactional
    public ImportReport importCsv(String content, boolean dryRun) {
        return importRows(CsvReader.parseWithLines(content), dryRun);
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
        return importRows(rows.stream().map(r -> new CsvReader.Row(r.number(), r.cells())).toList(), dryRun);
    }

    /**
     * Plantilla de Excel para llenar y volver a subir: hoja "Productos" con encabezados, dos ejemplos y listas
     * desplegables (unidad, impuesto, sí/no) con los códigos activos del negocio, y hoja "Instrucciones".
     */
    @Transactional(readOnly = true)
    public byte[] templateXlsx() {
        List<String> unitCodes = units.findAll().stream().filter(Unit::isActive).map(Unit::getCode).sorted().toList();
        List<String> taxCodes = taxes.findAll().stream().filter(Tax::isActive).map(Tax::getCode).sorted().toList();
        List<List<String>> productRows = List.of(
                templateHeaders(),
                List.of("GAS-400", "Gaseosa cola 400 ml", "7701234567890", "Bebidas", "UND", "IVA19", "1200", "2500",
                        "si", ""),
                List.of("ARR-1K", "Arroz 1 kg", "", "Granos", "UND", "IVA5", "3100", "4200", "si", "Bolsa de 1 kg"));
        XlsxWriter.Sheet products = new XlsxWriter.Sheet("Productos", productRows,
                List.of(14, 32, 18, 16, 10, 12, 12, 12, 20, 32), Set.of(0, 2),
                Map.of(4, unitCodes, 5, taxCodes, 8, List.of("si", "no")), true);
        List<List<String>> help = List.of(
                List.of("Cómo llenar la plantilla"),
                List.of("1. Escribe un producto por fila en la hoja Productos. Puedes borrar los dos ejemplos."),
                List.of("2. Obligatorias: sku (tu código interno, sin espacios), nombre, impuesto y precio."),
                List.of("3. unidad e impuesto: elige de la lista que aparece al tocar la celda. Si dejas la unidad vacía, queda UND."),
                List.of("4. costo y precio: solo el número, sin $ ni puntos de miles (ej.: 2500)."),
                List.of("5. controla_inventario: si (lo que tienes en bodega) o no (servicios, bolsas)."),
                List.of("6. Guarda el archivo tal cual (Excel .xlsx) y súbelo en Productos → Importar."),
                List.of("7. Si un sku ya existe, ese producto se actualiza. Las categorías nuevas se crean solas."),
                List.of(""),
                List.of("Unidades de tu negocio: " + String.join(", ", unitCodes)),
                List.of("Impuestos de tu negocio: " + String.join(", ", taxCodes)));
        XlsxWriter.Sheet instructions = new XlsxWriter.Sheet("Instrucciones", help, List.of(110), Set.of(), Map.of(),
                true);
        return XlsxWriter.write(List.of(products, instructions));
    }

    private ImportReport importRows(List<CsvReader.Row> table, boolean dryRun) {
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
            Row row = parseRow(rowNumber, cells, columns, unitByCode, taxByCode, errors);
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
            for (Row row : rows) {
                Category category = row.category() == null ? null
                        : createdCategories.getOrDefault(row.category().toLowerCase(Locale.ROOT),
                        categoriesByName.getOrDefault(row.category().toLowerCase(Locale.ROOT), List.of()).stream()
                                .findFirst().orElse(null));
                Product product = existing.get(row.sku());
                // En una actualización, las columnas ausentes conservan el valor actual del producto.
                boolean keepUnit = product != null && !columns.containsKey("unidad");
                // El costo de un producto con movimientos lo calcula el inventario: el archivo no lo cambia.
                boolean keepCost = product != null && (product.isCostLocked() || !columns.containsKey("costo"));
                // Con existencias no se deja de controlar el inventario (QA INV-3): el archivo no lo apaga.
                boolean keepTracking = product != null && (!columns.containsKey("controla_inventario")
                        || (product.isTrackInventory() && !row.trackInventory() && stock.hasStock(product.getId())));
                Product.Data data = new Product.Data(row.sku(), row.name(),
                        row.description() != null ? row.description() : product == null ? null : product.getDescription(),
                        category == null ? (product == null ? null : product.getCategoryId()) : category.getId(),
                        keepUnit ? product.getBaseUnitId() : row.unit().getId(), row.tax().getId(),
                        keepCost ? product.getCost() : row.cost(), row.price(),
                        keepTracking ? product.isTrackInventory() : row.trackInventory());
                if (product == null) {
                    product = Product.create(data);
                    if (row.barcode() != null) {
                        product.addBarcodeIfMissing(row.barcode());
                    }
                    products.save(product);
                } else {
                    product.apply(data);
                    if (row.barcode() != null) {
                        product.addBarcodeIfMissing(row.barcode());
                    }
                }
            }
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("created", toCreate);
            summary.put("updated", toUpdate);
            summary.put("newCategories", newCategories);
            audit.log("PRODUCTS_IMPORTED", "product", null, null, summary);
        }
        return new ImportReport(table.size() - 1, toCreate, toUpdate, List.copyOf(newCategories), errors, apply);
    }

    private Row parseRow(int number, List<String> cells, Map<String, Integer> columns, Map<String, Unit> unitByCode,
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
        if (!rowErrors.isEmpty()) {
            errors.add(new RowError(number, String.join(" ", rowErrors)));
            return null;
        }
        return new Row(number, sku, name, description.isEmpty() ? null : description, barcode,
                category.isEmpty() ? null : category, unit, tax, cost, price, track);
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
}
