package com.poshibrido.ai.application;

import com.poshibrido.ai.application.CatalogImportService.Option;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Precios de "Cargar con Aska" (decisión 300): margen sobre el precio sin IVA, redondeo hacia arriba a $100. */
class CatalogImportServiceTest {

    private static BigDecimal d(String v) {
        return new BigDecimal(v);
    }

    @Test
    void priceUsesMarginOverNetPriceAndRoundsUpToHundreds() {
        // 1.000 con 30 % → 1.428,57 sin IVA; con IVA 19 % incluido → 1.700; sin IVA en el precio → 1.500.
        assertThat(CatalogImportService.priceFor(d("1000"), d("30"), d("19"), true)).isEqualByComparingTo("1700");
        assertThat(CatalogImportService.priceFor(d("1000"), d("30"), d("19"), false)).isEqualByComparingTo("1500");
        assertThat(CatalogImportService.priceFor(d("700"), d("30"), d("0"), true)).isEqualByComparingTo("1000");
    }

    @Test
    void netCostRemovesTaxOnlyWhenTheListIncludesIt() {
        assertThat(CatalogImportService.netCost(d("1190"), d("19"), true)).isEqualByComparingTo("1000");
        assertThat(CatalogImportService.netCost(d("1190"), d("19"), false)).isEqualByComparingTo("1190");
        assertThat(CatalogImportService.netCost(d("1190"), d("0"), true)).isEqualByComparingTo("1190");
    }

    @Test
    void currentMarginIsNullWhenThereIsNothingToKeep() {
        assertThat(CatalogImportService.currentMargin(d("3570"), d("2000"), d("19"), true)).isEqualByComparingTo("33.3");
        assertThat(CatalogImportService.currentMargin(d("3570"), d("0"), d("19"), true)).isNull();
        assertThat(CatalogImportService.currentMargin(d("1000"), d("1200"), d("0"), false)).isNull();
    }

    @Test
    void mapsUnitsAndTaxesToWhatTheBusinessHas() {
        List<Option> units = List.of(new Option("UND", "Unidad", null), new Option("KG", "Kilogramo", null));
        assertThat(CatalogImportService.unitCode("Kilos", units)).isEqualTo("KG");
        assertThat(CatalogImportService.unitCode("bulto", units)).isEqualTo("UND");
        List<Option> taxes = List.of(new Option("IVA19", "IVA 19 %", d("19")), new Option("IVA5", "IVA 5 %", d("5")),
                new Option("EXCLUIDO", "Excluido", d("0")), new Option("EXENTO", "Exento", d("0")));
        assertThat(CatalogImportService.taxCode(d("5"), taxes)).isEqualTo("IVA5");
        assertThat(CatalogImportService.taxCode(d("0"), taxes)).isEqualTo("EXENTO");
        assertThat(CatalogImportService.taxCode(d("8"), taxes)).isEqualTo("EXCLUIDO");
    }

    @Test
    void costFromPriceWhenTheNotebookOnlyHasThePrice() {
        // 2.380 con IVA 19 % incluido → 2.000 sin IVA → con 30 % de margen, costo 1.400.
        assertThat(CatalogImportService.costFromPrice(d("2380"), d("30"), d("19"), true)).isEqualByComparingTo("1400");
        assertThat(CatalogImportService.costFromPrice(d("2000"), d("30"), d("0"), true)).isEqualByComparingTo("1400");
    }
}
