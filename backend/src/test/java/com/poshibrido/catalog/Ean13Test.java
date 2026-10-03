package com.poshibrido.catalog;

import com.poshibrido.catalog.application.Ean13;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class Ean13Test {

    @Test
    void computesKnownCheckDigits() {
        // 4006381333931 es el ejemplo clásico de EAN-13 (Wikipedia)
        assertThat(Ean13.checkDigit("770200400350")).isEqualTo(8);
        assertThat(Ean13.checkDigit("400638133393")).isEqualTo(1);
        assertThat(Ean13.isValid("4006381333931")).isTrue();
        assertThat(Ean13.isValid("4006381333932")).isFalse();
    }

    @Test
    void internalCodesUsePrefix29AndAreValid() {
        String code = Ean13.internal(1);
        assertThat(code).hasSize(13).startsWith("290000000001");
        assertThat(Ean13.isValid(code)).isTrue();
        assertThat(Ean13.isValid(Ean13.internal(9_999_999_999L))).isTrue();
        assertThatThrownBy(() -> Ean13.internal(10_000_000_000L)).isInstanceOf(IllegalArgumentException.class);
    }
}
