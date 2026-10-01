package com.poshibrido.shared;

import com.poshibrido.shared.csv.CsvReader;
import com.poshibrido.shared.csv.Numbers;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CsvTest {

    @Test
    void parsesSemicolonFileWithBomQuotesAndBlankLines() {
        String csv = "\uFEFFsku;nombre;precio\r\nA1;\"Gaseosa; 400 ml\";2.500\r\n\r\nA2;\"Dice \"\"hola\"\"\";1000\n";
        List<List<String>> rows = CsvReader.parse(csv);
        assertThat(rows).hasSize(3);
        assertThat(rows.get(0)).containsExactly("sku", "nombre", "precio");
        assertThat(rows.get(1)).containsExactly("A1", "Gaseosa; 400 ml", "2.500");
        assertThat(rows.get(2)).containsExactly("A2", "Dice \"hola\"", "1000");
    }

    @Test
    void keepsSourceLineNumbersSkippingBlankLines() {
        List<CsvReader.Row> rows = CsvReader.parseWithLines("a;b\n1;2\n\n3;\"x\ny\"\n4;5\n");
        assertThat(rows).extracting(CsvReader.Row::line).containsExactly(1, 2, 4, 6);
    }

    @Test
    void parsesCommaFileWithoutTrailingNewline() {
        List<List<String>> rows = CsvReader.parse("sku,nombre\nB1,Pan");
        assertThat(rows).containsExactly(List.of("sku", "nombre"), List.of("B1", "Pan"));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "1.234,56|1234.56", "1,234.56|1234.56", "$ 2.500|2500", "2,5|2.5", "2.5|2.5",
            "1.000.000|1000000", "12000|12000", "0,99|0.99", "1,000|1000"})
    void readsColombianAndEnglishNumbers(String raw, String expected) {
        assertThat(Numbers.parseFlexible(raw)).isEqualByComparingTo(new BigDecimal(expected));
    }

    @Test
    void invalidNumbersAreNull() {
        assertThat(Numbers.parseFlexible("abc")).isNull();
        assertThat(Numbers.parseFlexible("")).isNull();
    }
}
