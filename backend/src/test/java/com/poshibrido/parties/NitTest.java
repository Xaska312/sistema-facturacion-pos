package com.poshibrido.parties;

import com.poshibrido.parties.domain.Nit;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class NitTest {

    @ParameterizedTest
    @CsvSource({
            "800197268, 4",  // DIAN
            "890903938, 8",  // Bancolombia
            "899999068, 1",  // Ecopetrol
            "860034313, 7"   // Davivienda
    })
    void computesDianVerificationDigit(String nit, int expected) {
        assertThat(Nit.verificationDigit(nit)).isEqualTo(expected);
    }
}
