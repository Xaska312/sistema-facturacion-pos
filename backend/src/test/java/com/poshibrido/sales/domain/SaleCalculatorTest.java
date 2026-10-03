package com.poshibrido.sales.domain;

import com.poshibrido.sales.domain.SaleCalculator.LineAmounts;
import com.poshibrido.sales.domain.SaleCalculator.PaymentInput;
import com.poshibrido.sales.domain.SaleCalculator.Settlement;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SaleCalculatorTest {

    private static BigDecimal d(String value) {
        return new BigDecimal(value);
    }

    @Test
    void priceWithTaxIncludedIsSplitIntoBaseAndTax() {
        LineAmounts a = SaleCalculator.line(d("2000"), d("2"), d("0"), d("19"), true);
        assertThat(a.gross()).isEqualByComparingTo("4000");
        assertThat(a.total()).isEqualByComparingTo("4000");
        assertThat(a.taxableBase()).isEqualByComparingTo("3361.34");
        assertThat(a.tax()).isEqualByComparingTo("638.66");
        assertThat(a.taxableBase().add(a.tax())).isEqualByComparingTo(a.total());
    }

    @Test
    void priceWithoutTaxAddsTheTax() {
        LineAmounts a = SaleCalculator.line(d("1000"), d("3"), d("0"), d("19"), false);
        assertThat(a.taxableBase()).isEqualByComparingTo("3000");
        assertThat(a.tax()).isEqualByComparingTo("570");
        assertThat(a.total()).isEqualByComparingTo("3570");
    }

    @Test
    void discountIsAppliedBeforeTax() {
        LineAmounts a = SaleCalculator.line(d("10000"), d("1"), d("10"), d("19"), true);
        assertThat(a.discount()).isEqualByComparingTo("1000");
        assertThat(a.total()).isEqualByComparingTo("9000");
        assertThat(a.taxableBase()).isEqualByComparingTo("7563.03");
        assertThat(a.tax()).isEqualByComparingTo("1436.97");

        LineAmounts excluded = SaleCalculator.line(d("1000"), d("2"), d("5"), d("5"), false);
        assertThat(excluded.taxableBase()).isEqualByComparingTo("1900");
        assertThat(excluded.tax()).isEqualByComparingTo("95");
        assertThat(excluded.total()).isEqualByComparingTo("1995");
    }

    @Test
    void exemptAndFractionalQuantities() {
        LineAmounts a = SaleCalculator.line(d("8990"), d("0.75"), d("0"), d("0"), true);
        assertThat(a.total()).isEqualByComparingTo("6742.50");
        assertThat(a.tax()).isEqualByComparingTo("0");
        LineAmounts full = SaleCalculator.line(d("5000"), d("1"), d("100"), d("19"), true);
        assertThat(full.total()).isEqualByComparingTo("0");
    }

    @Test
    void changeComesOnlyFromCash() {
        Settlement s = SaleCalculator.settle(d("4000"), List.of(new PaymentInput(true, d("10000"))));
        assertThat(s.change()).isEqualByComparingTo("6000");
        assertThat(s.applied().getFirst()).isEqualByComparingTo("4000");
        assertThat(s.cashNet()).isEqualByComparingTo("4000");
        assertThat(s.paidTotal()).isEqualByComparingTo("10000");
    }

    @Test
    void mixedPaymentWithChange() {
        Settlement s = SaleCalculator.settle(d("25000"), List.of(
                new PaymentInput(false, d("20000")), new PaymentInput(true, d("10000"))));
        assertThat(s.change()).isEqualByComparingTo("5000");
        assertThat(s.applied()).usingElementComparator(BigDecimal::compareTo)
                .containsExactly(d("20000"), d("5000"));
        assertThat(s.cashNet()).isEqualByComparingTo("5000");
    }

    @Test
    void invalidPayments() {
        assertThatThrownBy(() -> SaleCalculator.settle(d("1000"), List.of(new PaymentInput(false, d("1500")))))
                .hasMessageContaining("tarjeta");
        assertThatThrownBy(() -> SaleCalculator.settle(d("1000"), List.of(new PaymentInput(true, d("900")))))
                .hasMessageContaining("Falta por pagar 100");
        assertThatThrownBy(() -> SaleCalculator.settle(d("1000"), List.of(new PaymentInput(true, d("0")))))
                .hasMessageContaining("mayor que cero");
        assertThatThrownBy(() -> SaleCalculator.settle(d("1000"), List.of()))
                .hasMessageContaining("Falta por pagar");
        assertThat(SaleCalculator.settle(d("0.00"), List.of()).change()).isEqualByComparingTo("0");
    }
}
