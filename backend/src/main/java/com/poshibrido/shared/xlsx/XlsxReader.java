package com.poshibrido.shared.xlsx;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Lee la primera hoja de un archivo de Excel (.xlsx) como filas de texto, sin librerías: un .xlsx es un zip con XML.
 * Solo lo necesario para importar una tabla (texto, números y sí/no); las fórmulas se leen por su último valor. Protegido
 * contra archivos inflados (zip bomb) y contra entidades externas en el XML.
 */
public final class XlsxReader {

    /** Una fila con su número en Excel (1 = encabezados). */
    public record Row(int number, List<String> cells) {
    }

    public static class InvalidXlsxException extends RuntimeException {
        public InvalidXlsxException(String message) {
            super(message);
        }
    }

    private static final long MAX_ENTRY_BYTES = 30L * 1024 * 1024;
    /** Entre todas las partes que se guardan (hojas, textos y el libro). */
    private static final long MAX_TOTAL_BYTES = 60L * 1024 * 1024;
    /** Una tabla de importación tiene pocas columnas: las que pasen de aquí se ignoran. */
    private static final int MAX_COLUMNS = 200;
    private static final int MAX_ENTRIES = 2000;

    private XlsxReader() {
    }

    /** ¿Empieza como un zip (PK\3\4)? Un CSV nunca empieza así. */
    public static boolean looksLikeXlsx(byte[] bytes) {
        return bytes.length > 4 && bytes[0] == 'P' && bytes[1] == 'K' && bytes[2] == 3 && bytes[3] == 4;
    }

    public static List<Row> firstSheet(byte[] bytes) {
        Map<String, byte[]> parts = unzip(bytes);
        String sheetPath = firstSheetPath(parts);
        byte[] sheet = parts.get(sheetPath);
        if (sheet == null) {
            throw new InvalidXlsxException("El archivo de Excel no tiene hojas.");
        }
        List<String> shared = parts.containsKey("xl/sharedStrings.xml")
                ? sharedStrings(parts.get("xl/sharedStrings.xml")) : List.of();
        return rows(sheet, shared);
    }

    // ------------------------------------------------------------------ partes del zip

    private static Map<String, byte[]> unzip(byte[] bytes) {
        Map<String, byte[]> parts = new HashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            int count = 0;
            long total = 0;
            while ((entry = zip.getNextEntry()) != null) {
                if (++count > MAX_ENTRIES) {
                    throw new InvalidXlsxException("El archivo de Excel tiene demasiadas partes.");
                }
                String name = entry.getName();
                if (name.equals("xl/workbook.xml") || name.equals("xl/_rels/workbook.xml.rels")
                        || name.equals("xl/sharedStrings.xml") || name.startsWith("xl/worksheets/sheet")) {
                    byte[] part = readLimited(zip);
                    total += part.length;
                    if (total > MAX_TOTAL_BYTES) {
                        throw new InvalidXlsxException("El archivo de Excel es demasiado grande.");
                    }
                    parts.put(name, part);
                }
            }
        } catch (IOException ex) {
            throw new InvalidXlsxException("El archivo no es un Excel válido (.xlsx).");
        }
        if (parts.isEmpty()) {
            throw new InvalidXlsxException("El archivo no es un Excel válido (.xlsx).");
        }
        return parts;
    }

    private static byte[] readLimited(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        long total = 0;
        int read;
        while ((read = in.read(buffer)) != -1) {
            total += read;
            if (total > MAX_ENTRY_BYTES) {
                throw new InvalidXlsxException("El archivo de Excel es demasiado grande.");
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    /**
     * La hoja a importar: la llamada "Productos" (la de la plantilla, aunque el usuario mueva las hojas) o, si no hay,
     * la primera visible en el orden del libro (no necesariamente sheet1.xml).
     */
    private static String firstSheetPath(Map<String, byte[]> parts) {
        String relId = null;
        if (parts.containsKey("xl/workbook.xml")) {
            List<Map<String, String>> sheets = elements(parts.get("xl/workbook.xml"), "sheet").stream()
                    .filter(sheet -> !"hidden".equals(sheet.get("state")) && !"veryHidden".equals(sheet.get("state")))
                    .toList();
            relId = sheets.stream().filter(sheet -> "productos".equalsIgnoreCase(sheet.getOrDefault("name", "").trim()))
                    .findFirst().or(() -> sheets.stream().findFirst()).map(sheet -> sheet.get("id")).orElse(null);
        }
        if (relId != null && parts.containsKey("xl/_rels/workbook.xml.rels")) {
            for (Map<String, String> rel : elements(parts.get("xl/_rels/workbook.xml.rels"), "Relationship")) {
                if (relId.equals(rel.get("Id"))) {
                    String target = rel.getOrDefault("Target", "");
                    return target.startsWith("/") ? target.substring(1) : "xl/" + target;
                }
            }
        }
        return "xl/worksheets/sheet1.xml";
    }

    // ------------------------------------------------------------------ XML

    private static XMLStreamReader reader(byte[] xml) throws XMLStreamException {
        XMLInputFactory factory = XMLInputFactory.newFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        return factory.createXMLStreamReader(new ByteArrayInputStream(xml));
    }

    /** Atributos (por nombre local) de cada elemento con ese nombre local. */
    private static List<Map<String, String>> elements(byte[] xml, String element) {
        List<Map<String, String>> result = new ArrayList<>();
        try {
            XMLStreamReader r = reader(xml);
            while (r.hasNext()) {
                if (r.next() == XMLStreamConstants.START_ELEMENT && r.getLocalName().equals(element)) {
                    Map<String, String> attributes = new HashMap<>();
                    for (int i = 0; i < r.getAttributeCount(); i++) {
                        attributes.put(r.getAttributeLocalName(i), r.getAttributeValue(i));
                    }
                    result.add(attributes);
                }
            }
        } catch (XMLStreamException ex) {
            throw new InvalidXlsxException("El archivo de Excel está dañado.");
        }
        return result;
    }

    private static List<String> sharedStrings(byte[] xml) {
        List<String> strings = new ArrayList<>();
        try {
            XMLStreamReader r = reader(xml);
            StringBuilder current = null;
            boolean inPhonetic = false;
            while (r.hasNext()) {
                int event = r.next();
                if (event == XMLStreamConstants.START_ELEMENT) {
                    switch (r.getLocalName()) {
                        case "si" -> current = new StringBuilder();
                        case "rPh" -> inPhonetic = true;
                        case "t" -> {
                            String text = r.getElementText();
                            if (current != null && !inPhonetic) {
                                current.append(text);
                            }
                        }
                        default -> { }
                    }
                } else if (event == XMLStreamConstants.END_ELEMENT) {
                    if (r.getLocalName().equals("rPh")) {
                        inPhonetic = false;
                    } else if (r.getLocalName().equals("si") && current != null) {
                        strings.add(current.toString());
                        current = null;
                    }
                }
            }
        } catch (XMLStreamException ex) {
            throw new InvalidXlsxException("El archivo de Excel está dañado.");
        }
        return strings;
    }

    private static List<Row> rows(byte[] xml, List<String> shared) {
        List<Row> rows = new ArrayList<>();
        try {
            XMLStreamReader r = reader(xml);
            int rowNumber = 0;
            List<String> cells = null;
            String cellRef = null;
            String cellType = null;
            String value = null;
            StringBuilder inline = null;
            while (r.hasNext()) {
                int event = r.next();
                if (event == XMLStreamConstants.START_ELEMENT) {
                    switch (r.getLocalName()) {
                        case "row" -> {
                            String number = r.getAttributeValue(null, "r");
                            rowNumber = number == null ? rowNumber + 1 : Integer.parseInt(number);
                            cells = new ArrayList<>();
                        }
                        case "c" -> {
                            cellRef = r.getAttributeValue(null, "r");
                            cellType = r.getAttributeValue(null, "t");
                            value = null;
                            inline = null;
                        }
                        case "v" -> value = r.getElementText();
                        case "is" -> inline = new StringBuilder();
                        case "t" -> {
                            String text = r.getElementText();
                            if (inline != null) {
                                inline.append(text);
                            }
                        }
                        default -> { }
                    }
                } else if (event == XMLStreamConstants.END_ELEMENT) {
                    if (r.getLocalName().equals("c") && cells != null) {
                        int column = cellRef == null ? cells.size() : columnIndex(cellRef);
                        if (column < 0) {
                            throw new InvalidXlsxException("El archivo de Excel está dañado.");
                        }
                        if (column >= MAX_COLUMNS) {
                            continue;
                        }
                        while (cells.size() < column) {
                            cells.add("");
                        }
                        String text = cellText(cellType, value, inline, shared);
                        if (column < cells.size()) {
                            cells.set(column, text);
                        } else {
                            cells.add(text);
                        }
                    } else if (r.getLocalName().equals("row") && cells != null) {
                        if (cells.stream().anyMatch(c -> !c.isBlank())) {
                            rows.add(new Row(rowNumber, List.copyOf(cells)));
                        }
                        cells = null;
                    }
                }
            }
        } catch (XMLStreamException | NumberFormatException ex) {
            throw new InvalidXlsxException("El archivo de Excel está dañado.");
        }
        return rows;
    }

    private static String cellText(String type, String value, StringBuilder inline, List<String> shared) {
        if ("inlineStr".equals(type)) {
            return inline == null ? "" : inline.toString().trim();
        }
        if (value == null) {
            return "";
        }
        if ("s".equals(type)) {
            int index = Integer.parseInt(value.trim());
            return index >= 0 && index < shared.size() ? shared.get(index).trim() : "";
        }
        if ("b".equals(type)) {
            return "1".equals(value.trim()) ? "si" : "no";
        }
        if ("str".equals(type) || "e".equals(type)) {
            return "e".equals(type) ? "" : value.trim();
        }
        return number(value.trim());
    }

    /**
     * "2500" → "2500"; "1200.5" → "1200.5"; "7.70123456789E12" → "7701234567890"; "0.125" → "0.1250". Con exactamente
     * 3 decimales se agrega un cero: la lectura flexible de números tomaría "0.125" como 125 (punto de miles).
     */
    static String number(String raw) {
        try {
            String plain = new BigDecimal(raw).stripTrailingZeros().toPlainString();
            int dot = plain.indexOf('.');
            return dot >= 0 && plain.length() - dot - 1 == 3 ? plain + "0" : plain;
        } catch (NumberFormatException ex) {
            return raw;
        }
    }

    /** "C12" → 2. */
    static int columnIndex(String ref) {
        int index = 0;
        for (int i = 0; i < ref.length() && Character.isLetter(ref.charAt(i)); i++) {
            index = index * 26 + (Character.toUpperCase(ref.charAt(i)) - 'A' + 1);
        }
        return index - 1;
    }
}
