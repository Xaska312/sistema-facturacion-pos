package com.poshibrido.shared;

import com.poshibrido.shared.csv.CsvWriter;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

class CsvWriterTest {

    private final CsvWriter csv = new CsvWriter(ZoneId.of("America/Bogota"));

    @Test
    void writesExcelFriendlySpanishCsvWithBom() {
        csv.row("Producto", "Cantidad", "Total").row("Café", new BigDecimal("2.5000"), new BigDecimal("1234.50"));
        byte[] bytes = csv.toBytes();
        assertThat(new byte[]{bytes[0], bytes[1], bytes[2]}).containsExactly(0xEF, 0xBB, 0xBF);
        assertThat(new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8))
                .isEqualTo("Producto;Cantidad;Total\r\nCafé;2,5;1234,5\r\n");
    }

    @Test
    void formatsDatesNumbersAndEmptyCells() {
        csv.row(LocalDate.of(2026, 10, 5), Instant.parse("2026-10-05T15:30:00Z"), 7L, null, true,
                new BigDecimal("-1000.00"));
        assertThat(csv.toString()).isEqualTo("2026-10-05;2026-10-05 10:30;7;;Sí;-1000\r\n");
    }

    @Test
    void quotesSeparatorsAndNeutralizesFormulas() {
        csv.row("Calle 10; local 2", "Dijo \"hola\"", "=HYPERLINK(\"x\")", "+57 300", "@SUM(A1)", "-2");
        assertThat(csv.toString()).isEqualTo(
                "\"Calle 10; local 2\";\"Dijo \"\"hola\"\"\";\"'=HYPERLINK(\"\"x\"\")\";'+57 300;'@SUM(A1);'-2\r\n");
    }
}
