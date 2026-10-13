package com.poshibrido.shared.xlsx;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Escribe un .xlsx sencillo sin librerías (plantillas para llenar en Excel): encabezado en negrilla y fijo, anchos de
 * columna, columnas de texto (para que Excel no borre los ceros de un código de barras) y listas desplegables.
 */
public final class XlsxWriter {

    /**
     * @param textColumns columnas (desde 0) con formato de texto
     * @param dropdowns   columna → opciones de la lista desplegable (filas 2 a 2000)
     */
    public record Sheet(String name, List<List<String>> rows, List<Integer> widths, Set<Integer> textColumns,
                        Map<Integer, List<String>> dropdowns, boolean header) {
    }

    private static final int STYLE_BOLD = 1;
    private static final int STYLE_TEXT = 2;
    private static final int STYLE_WRAP = 3;

    private XlsxWriter() {
    }

    public static byte[] write(List<Sheet> sheets) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            put(zip, "[Content_Types].xml", contentTypes(sheets.size()));
            put(zip, "_rels/.rels", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\
                    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\
                    </Relationships>""");
            put(zip, "xl/workbook.xml", workbook(sheets));
            put(zip, "xl/_rels/workbook.xml.rels", workbookRels(sheets.size()));
            put(zip, "xl/styles.xml", STYLES);
            for (int i = 0; i < sheets.size(); i++) {
                put(zip, "xl/worksheets/sheet" + (i + 1) + ".xml", sheet(sheets.get(i)));
            }
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
        return out.toByteArray();
    }

    private static void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static String contentTypes(int sheets) {
        StringBuilder xml = new StringBuilder("""
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\
                <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\
                <Default Extension="xml" ContentType="application/xml"/>\
                <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\
                <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>""");
        for (int i = 1; i <= sheets; i++) {
            xml.append("<Override PartName=\"/xl/worksheets/sheet").append(i).append(".xml\" ContentType=\"")
                    .append("application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>");
        }
        return xml.append("</Types>").toString();
    }

    private static String workbook(List<Sheet> sheets) {
        StringBuilder xml = new StringBuilder("""
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" \
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>""");
        for (int i = 0; i < sheets.size(); i++) {
            xml.append("<sheet name=\"").append(escape(sheets.get(i).name())).append("\" sheetId=\"").append(i + 1)
                    .append("\" r:id=\"rId").append(i + 1).append("\"/>");
        }
        return xml.append("</sheets></workbook>").toString();
    }

    private static String workbookRels(int sheets) {
        StringBuilder xml = new StringBuilder("""
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">""");
        for (int i = 1; i <= sheets; i++) {
            xml.append("<Relationship Id=\"rId").append(i).append("\" Type=\"http://schemas.openxmlformats.org/")
                    .append("officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet").append(i)
                    .append(".xml\"/>");
        }
        xml.append("<Relationship Id=\"rId").append(sheets + 1).append("\" Type=\"http://schemas.openxmlformats.org/")
                .append("officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>");
        return xml.append("</Relationships>").toString();
    }

    /** 0 normal, 1 negrilla, 2 texto (@), 3 ajustar texto. */
    private static final String STYLES = """
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\
            <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>\
            <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>\
            <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>\
            <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>\
            <cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>\
            <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>\
            <xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>\
            <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>\
            </cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>""";

    private static String sheet(Sheet sheet) {
        StringBuilder xml = new StringBuilder("""
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">""");
        if (sheet.header()) {
            xml.append("<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" ")
                    .append("activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>");
        }
        if (!sheet.widths().isEmpty()) {
            xml.append("<cols>");
            for (int c = 0; c < sheet.widths().size(); c++) {
                xml.append("<col min=\"").append(c + 1).append("\" max=\"").append(c + 1).append("\" width=\"")
                        .append(sheet.widths().get(c)).append("\" customWidth=\"1\"");
                if (sheet.textColumns().contains(c)) {
                    xml.append(" style=\"").append(STYLE_TEXT).append('"');
                }
                xml.append("/>");
            }
            xml.append("</cols>");
        }
        xml.append("<sheetData>");
        for (int r = 0; r < sheet.rows().size(); r++) {
            List<String> row = sheet.rows().get(r);
            xml.append("<row r=\"").append(r + 1).append("\">");
            for (int c = 0; c < row.size(); c++) {
                String value = row.get(c) == null ? "" : row.get(c);
                if (value.isEmpty()) {
                    continue;
                }
                String ref = column(c) + (r + 1);
                boolean headerCell = sheet.header() && r == 0;
                boolean text = sheet.textColumns().contains(c);
                int style = headerCell ? STYLE_BOLD : text ? STYLE_TEXT : sheet.widths().isEmpty() ? STYLE_WRAP : 0;
                if (!headerCell && !text && value.matches("^-?\\d{1,12}(\\.\\d+)?$")) {
                    xml.append("<c r=\"").append(ref).append("\"><v>").append(value).append("</v></c>");
                } else {
                    xml.append("<c r=\"").append(ref).append("\" t=\"inlineStr\"");
                    if (style != 0) {
                        xml.append(" s=\"").append(style).append('"');
                    }
                    xml.append("><is><t xml:space=\"preserve\">").append(escape(value)).append("</t></is></c>");
                }
            }
            xml.append("</row>");
        }
        xml.append("</sheetData>");
        if (!sheet.dropdowns().isEmpty()) {
            StringBuilder validations = new StringBuilder();
            int count = 0;
            for (Map.Entry<Integer, List<String>> entry : sheet.dropdowns().entrySet()) {
                String list = String.join(",", entry.getValue());
                if (list.isEmpty() || list.length() > 250 || list.contains("\"")) {
                    continue;
                }
                String col = column(entry.getKey());
                validations.append("<dataValidation type=\"list\" allowBlank=\"1\" showErrorMessage=\"1\" ")
                        .append("errorTitle=\"Valor no válido\" error=\"Elige un valor de la lista.\" sqref=\"")
                        .append(col).append("2:").append(col).append("2000\"><formula1>\"")
                        .append(escape(list)).append("\"</formula1></dataValidation>");
                count++;
            }
            if (count > 0) {
                xml.append("<dataValidations count=\"").append(count).append("\">").append(validations)
                        .append("</dataValidations>");
            }
        }
        return xml.append("</worksheet>").toString();
    }

    /** 0 → "A", 25 → "Z", 26 → "AA". */
    static String column(int index) {
        StringBuilder name = new StringBuilder();
        int n = index + 1;
        while (n > 0) {
            int rem = (n - 1) % 26;
            name.insert(0, (char) ('A' + rem));
            n = (n - 1) / 26;
        }
        return name.toString();
    }

    private static String escape(String text) {
        StringBuilder out = new StringBuilder(text.length());
        for (char ch : text.toCharArray()) {
            switch (ch) {
                case '&' -> out.append("&amp;");
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '"' -> out.append("&quot;");
                default -> {
                    // Caracteres de control no válidos en XML 1.0 (salvo tab y saltos de línea).
                    if (ch >= 0x20 || ch == '\t' || ch == '\n' || ch == '\r') {
                        out.append(ch);
                    }
                }
            }
        }
        return out.toString();
    }
}
