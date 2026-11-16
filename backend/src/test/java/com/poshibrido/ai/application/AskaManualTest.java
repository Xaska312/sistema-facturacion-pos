package com.poshibrido.ai.application;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** El manual de uso para Aska (decisión 357), con el JSON que exporta el frontend. */
class AskaManualTest {

    private final AskaManual manual = new AskaManual();

    @Test
    @SuppressWarnings("unchecked")
    void findsHowToDoThingsInTheAppWithItsStepsAndLink() {
        assertThat(manual.size()).isGreaterThan(50);
        List<Map<String, Object>> found = (List<Map<String, Object>>) manual.search("¿Cómo anulo una venta?");
        assertThat(found).isNotEmpty().hasSizeLessThanOrEqualTo(3);
        assertThat(found.getFirst().get("titulo").toString()).containsIgnoringCase("anular");
        assertThat(found.getFirst().get("enlace").toString()).startsWith("https://app.xaska.co/manual#");
        assertThat((List<String>) found.getFirst().get("pasos")).isNotEmpty();
        List<Map<String, Object>> close = (List<Map<String, Object>>) manual.search("cierre de caja");
        assertThat(close).extracting(m -> m.get("enlace").toString()).anyMatch(l -> l.endsWith("#cerrar-caja"));
    }

    @Test
    void readsWordsWithoutAccentsOrFillers() {
        assertThat(AskaManual.words("¿Cómo ANULO una venta?")).containsExactly("anul", "vent");
        assertThat(AskaManual.words("anulación")).containsExactly("anulaci");
        assertThat(manual.search("xyzzy").toString()).contains("no tiene nada");
        assertThatThrownBy(() -> manual.search(" ")).hasMessageContaining("Falta");
    }
}
