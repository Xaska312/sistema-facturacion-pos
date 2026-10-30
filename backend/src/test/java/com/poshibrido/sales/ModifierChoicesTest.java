package com.poshibrido.sales;

import com.poshibrido.catalog.application.ModifierApi.Group;
import com.poshibrido.catalog.application.ModifierApi.Option;
import com.poshibrido.sales.application.ModifierChoices;
import com.poshibrido.sales.application.ModifierChoices.Choice;
import com.poshibrido.sales.application.ModifierChoices.Result;
import com.poshibrido.shared.error.BusinessRuleException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Reglas de las adiciones de una línea (Fase 12b-1, decisión 268): granizado con tamaño, licor y shots. */
class ModifierChoicesTest {

    private final Option small = option("Pequeño", "0", 1);
    private final Option large = option("Grande", "4000", 1);
    private final Option rum = option("Ron", "0", 1);
    private final Option noLiquor = option("Sin licor", "-2000", 1);
    private final Option shot = option("Shot extra", "3000", 3);
    private final Option ice = option("Hielo aparte", "0", 1);

    private final Group size = new Group(UUID.randomUUID(), "Tamaño", 1, 1, List.of(small, large));
    private final Group liquor = new Group(UUID.randomUUID(), "Licor", 1, 1, List.of(rum, noLiquor));
    private final Group extras = new Group(UUID.randomUUID(), "Extras", 0, 4, List.of(shot, ice));
    private final List<Group> granizado = List.of(size, liquor, extras);

    @Test
    void sumsTheOptionsInGroupOrderWithTheirServerPrice() {
        Result result = ModifierChoices.resolve("Granizado", granizado,
                List.of(new Choice(shot.id(), 2), new Choice(large.id(), 1), new Choice(rum.id(), 1)), true);
        assertThat(result.perUnit()).isEqualByComparingTo("10000");
        assertThat(result.chosen()).extracting(ModifierChoices.Chosen::optionName)
                .containsExactly("Grande", "Ron", "Shot extra");
        assertThat(result.chosen()).extracting(ModifierChoices.Chosen::position).containsExactly(1, 2, 3);
        assertThat(result.chosen().get(2).groupName()).isEqualTo("Extras");
    }

    @Test
    void anOptionCanLowerThePrice() {
        Result result = ModifierChoices.resolve("Granizado", granizado,
                List.of(new Choice(small.id(), 1), new Choice(noLiquor.id(), 1)), true);
        assertThat(result.perUnit()).isEqualByComparingTo("-2000");
    }

    @Test
    void requiredGroupsAndLimits() {
        assertThatThrownBy(() -> ModifierChoices.resolve("Granizado", granizado, List.of(new Choice(rum.id(), 1)), true))
                .isInstanceOf(BusinessRuleException.class).hasMessage("Elige Tamaño para Granizado.");
        assertThatThrownBy(() -> ModifierChoices.resolve("Granizado", granizado,
                List.of(new Choice(small.id(), 1), new Choice(large.id(), 1), new Choice(rum.id(), 1)), true))
                .hasMessageContaining("se elige una sola opción");
        assertThatThrownBy(() -> ModifierChoices.resolve("Granizado", granizado,
                List.of(new Choice(small.id(), 1), new Choice(rum.id(), 1), new Choice(shot.id(), 4)), true))
                .hasMessage("Shot extra se elige hasta 3 veces.");
        assertThatThrownBy(() -> ModifierChoices.resolve("Granizado", granizado,
                List.of(new Choice(small.id(), 1), new Choice(rum.id(), 1), new Choice(shot.id(), 3),
                        new Choice(ice.id(), 1), new Choice(shot.id(), 1)), true))
                .hasMessageContaining("repetida");
    }

    @Test
    void anOptionFromAnotherProductIsRejected() {
        assertThatThrownBy(() -> ModifierChoices.resolve("Gaseosa", List.of(extras),
                List.of(new Choice(large.id(), 1)), true))
                .hasMessageContaining("ya no está disponible");
    }

    @Test
    void withoutRequiringTheMinimumNothingIsChosenAndNothingAdded() {
        assertThat(ModifierChoices.resolve("Granizado", granizado, List.of(), false)).isEqualTo(Result.NONE);
        assertThat(ModifierChoices.resolve("Gaseosa", null, null, true)).isEqualTo(Result.NONE);
    }

    private static Option option(String name, String delta, int max) {
        return new Option(UUID.randomUUID(), name, new BigDecimal(delta).setScale(2), max);
    }
}
