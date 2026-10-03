package com.poshibrido.shared.csv;

import java.util.ArrayList;
import java.util.List;

/**
 * Lector CSV mínimo (RFC 4180): comillas dobles, comillas escapadas ("") y saltos de línea dentro de
 * campos entre comillas. Detecta el separador (';' o ',') a partir de la primera línea, porque Excel
 * en español exporta con punto y coma. Quita el BOM UTF-8 si existe.
 */
public final class CsvReader {

    private CsvReader() {
    }

    /** Fila con el número de línea del archivo donde empieza (1 = primera línea). */
    public record Row(int line, List<String> cells) {
    }

    public static List<List<String>> parse(String content) {
        return parseWithLines(content).stream().map(Row::cells).toList();
    }

    /** Como {@link #parse} pero conserva la línea de origen de cada fila (para reportar errores). */
    public static List<Row> parseWithLines(String content) {
        String text = content.startsWith("\uFEFF") ? content.substring(1) : content;
        char separator = detectSeparator(text);
        List<Row> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        int line = 1;
        int rowStartLine = 1;
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        int i = 0;
        while (i < text.length()) {
            char c = text.charAt(i);
            if (quoted) {
                if (c == '\n') {
                    line++;
                }
                if (c == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                        field.append('"');
                        i++;
                    } else {
                        quoted = false;
                    }
                } else {
                    field.append(c);
                }
            } else if (c == '"' && field.isEmpty()) {
                quoted = true;
            } else if (c == separator) {
                row.add(field.toString());
                field.setLength(0);
            } else if (c == '\n' || c == '\r') {
                row.add(field.toString());
                field.setLength(0);
                addIfNotBlank(rows, row, rowStartLine);
                row = new ArrayList<>();
                if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') {
                    i++;
                }
                line++;
                rowStartLine = line;
            } else {
                field.append(c);
            }
            i++;
        }
        if (!field.isEmpty() || !row.isEmpty()) {
            row.add(field.toString());
            addIfNotBlank(rows, row, rowStartLine);
        }
        return rows;
    }

    static char detectSeparator(String text) {
        int end = text.indexOf('\n');
        String firstLine = end < 0 ? text : text.substring(0, end);
        long semicolons = firstLine.chars().filter(ch -> ch == ';').count();
        long commas = firstLine.chars().filter(ch -> ch == ',').count();
        return semicolons >= commas && semicolons > 0 ? ';' : ',';
    }

    private static void addIfNotBlank(List<Row> rows, List<String> row, int line) {
        if (row.stream().anyMatch(value -> !value.isBlank())) {
            rows.add(new Row(line, row));
        }
    }
}
