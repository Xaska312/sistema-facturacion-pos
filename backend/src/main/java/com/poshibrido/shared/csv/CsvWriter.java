package com.poshibrido.shared.csv;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * CSV para Excel en español (Colombia): separador {@code ;}, decimales con coma, sin separador de miles y UTF-8
 * con BOM para que Excel reconozca las tildes.
 *
 * <p>Los textos que empiezan por {@code = + - @}, tabulador o retorno se escriben con un apóstrofo delante para que
 * Excel no los ejecute como fórmulas (inyección de CSV). Los números no se alteran.
 */
public final class CsvWriter {

    public static final String CONTENT_TYPE = "text/csv;charset=UTF-8";
    private static final char SEPARATOR = ';';
    private static final byte[] BOM = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    /**
     * Se escribe directo en bytes UTF-8 (con el BOM al inicio): antes un StringBuilder, su String y los bytes eran
     * tres copias del archivo en memoria al mismo tiempo (QA INV-7).
     */
    private final ByteArrayOutputStream bytes = new ByteArrayOutputStream(8192);
    private final Writer out = new OutputStreamWriter(bytes, StandardCharsets.UTF_8);
    private final ZoneId zone;
    private int rows;

    /**
     * @param zone zona horaria del negocio para escribir fechas y horas
     */
    public CsvWriter(ZoneId zone) {
        this.zone = zone;
        bytes.writeBytes(BOM);
    }

    public CsvWriter row(Object... values) {
        try {
            for (int i = 0; i < values.length; i++) {
                if (i > 0) {
                    out.write(SEPARATOR);
                }
                out.write(cell(values[i]));
            }
            out.write("\r\n");
        } catch (IOException ex) {
            throw new UncheckedIOException(ex); // en memoria no ocurre
        }
        rows++;
        return this;
    }

    /** Filas escritas sin contar el encabezado (la primera). */
    public int dataRows() {
        return Math.max(rows - 1, 0);
    }

    /** El archivo completo: BOM + filas en UTF-8. */
    public byte[] toBytes() {
        flush();
        return bytes.toByteArray();
    }

    /** Las filas como texto, sin el BOM (para pruebas). */
    @Override
    public String toString() {
        flush();
        byte[] all = bytes.toByteArray();
        return new String(all, BOM.length, all.length - BOM.length, StandardCharsets.UTF_8);
    }

    private void flush() {
        try {
            out.flush();
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    private String cell(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof BigDecimal d) {
            return d.stripTrailingZeros().toPlainString().replace('.', ',');
        }
        if (value instanceof Double || value instanceof Float) {
            return cell(BigDecimal.valueOf(((Number) value).doubleValue()));
        }
        if (value instanceof Number n) {
            return n.toString();
        }
        if (value instanceof Instant instant) {
            return DATE_TIME.format(instant.atZone(zone));
        }
        if (value instanceof LocalDate date) {
            return date.toString();
        }
        if (value instanceof Boolean b) {
            return b ? "Sí" : "No";
        }
        return text(value.toString());
    }

    private static String text(String raw) {
        String value = raw;
        if (!value.isEmpty() && "=+-@\t\r".indexOf(value.charAt(0)) >= 0) {
            value = "'" + value;
        }
        boolean quote = value.indexOf(SEPARATOR) >= 0 || value.indexOf('"') >= 0 || value.indexOf('\n') >= 0
                || value.indexOf('\r') >= 0;
        return quote ? '"' + value.replace("\"", "\"\"") + '"' : value;
    }
}
