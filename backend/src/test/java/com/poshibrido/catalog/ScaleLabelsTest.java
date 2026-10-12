package com.poshibrido.catalog;

import com.poshibrido.catalog.application.Ean13;
import com.poshibrido.catalog.application.ScaleLabels;
import com.poshibrido.catalog.application.ScaleLabels.Format;
import com.poshibrido.catalog.application.ScaleLabels.Kind;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ScaleLabelsTest {

    static String ean(String first12) {
        return first12 + Ean13.checkDigit(first12);
    }

    @Test
    void readsPluAndWeightOrPrice() {
        Format weight = new Format(true, "20", 5, Kind.WEIGHT, 3);
        var label = ScaleLabels.parse(ean("200012300750"), weight).orElseThrow();
        assertThat(label.plu()).isEqualTo("123");
        assertThat(label.value()).isEqualByComparingTo("0.750");

        Format price = new Format(true, "2", 4, Kind.PRICE, 0);
        var priced = ScaleLabels.parse(ean("200450125000"), price).orElseThrow();
        assertThat(priced.plu()).isEqualTo("45");
        assertThat(priced.value()).isEqualByComparingTo("125000");
    }

    @Test
    void ignoresOtherCodes() {
        Format weight = new Format(true, "20", 5, Kind.WEIGHT, 3);
        assertThat(ScaleLabels.parse("7701234567897", weight)).isEmpty();          // otro prefijo
        assertThat(ScaleLabels.parse("2000123007500", weight)).isEmpty();          // dígito de control errado
        assertThat(ScaleLabels.parse(ean("200000000750"), weight)).isEmpty();      // PLU 0
        assertThat(ScaleLabels.parse(ean("200012300750"), new Format(false, "20", 5, Kind.WEIGHT, 3))).isEmpty();
    }
}
