package com.poshibrido.sales.application;

import com.poshibrido.catalog.application.ModifierApi.Group;
import com.poshibrido.catalog.application.ModifierApi.Option;
import com.poshibrido.shared.error.BusinessRuleException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Reglas de las adiciones de una línea de venta (Fase 12b-1, decisión 268): cada opción debe ser de un grupo del
 * producto, cada grupo respeta su mínimo (obligatorio) y su máximo, y cada opción sus veces. El precio de cada opción
 * es el del servidor.
 */
public final class ModifierChoices {

    private ModifierChoices() {
    }

    /** Lo que eligió el cajero: una opción y cuántas veces. */
    public record Choice(UUID optionId, int quantity) {
    }

    /** Opción elegida con nombre y precio congelados para la venta. */
    public record Chosen(int position, String groupName, UUID optionId, String optionName, int quantity,
                         BigDecimal unitPrice) {

        public BigDecimal amount() {
            return unitPrice.multiply(BigDecimal.valueOf(quantity));
        }
    }

    /** {@code perUnit}: lo que suman las adiciones a cada unidad del producto (puede ser negativo). */
    public record Result(List<Chosen> chosen, BigDecimal perUnit) {
        public static final Result NONE = new Result(List.of(), BigDecimal.ZERO.setScale(2));
    }

    /**
     * @param requireMinimum exige los grupos obligatorios (no cuando el módulo está apagado o la línea viene de un
     *                       pedido o una cotización)
     */
    public static Result resolve(String productName, List<Group> groups, List<Choice> choices, boolean requireMinimum) {
        List<Group> mine = groups == null ? List.of() : groups;
        List<Choice> picked = choices == null ? List.of() : choices;
        Map<UUID, Group> groupOf = new HashMap<>();
        Map<UUID, Option> optionOf = new HashMap<>();
        for (Group g : mine) {
            for (Option o : g.options()) {
                groupOf.put(o.id(), g);
                optionOf.put(o.id(), o);
            }
        }
        Map<UUID, Integer> quantities = new HashMap<>();
        Set<UUID> seen = new HashSet<>();
        for (Choice c : picked) {
            if (c == null || c.optionId() == null) {
                throw new BusinessRuleException("Falta una opción en las adiciones de " + productName + ".");
            }
            Option option = optionOf.get(c.optionId());
            if (option == null) {
                throw new BusinessRuleException("Una de las adiciones de " + productName + " ya no está disponible. "
                        + "Vuelve a elegirlas.");
            }
            if (!seen.add(c.optionId())) {
                throw new BusinessRuleException(option.name() + " está repetida en " + productName + ".");
            }
            if (c.quantity() < 1 || c.quantity() > option.maxQuantity()) {
                throw new BusinessRuleException(option.maxQuantity() == 1
                        ? option.name() + " se elige una sola vez."
                        : option.name() + " se elige hasta " + option.maxQuantity() + " veces.");
            }
            quantities.put(c.optionId(), c.quantity());
        }
        List<Chosen> chosen = new ArrayList<>();
        BigDecimal perUnit = BigDecimal.ZERO.setScale(2);
        int position = 0;
        for (Group g : mine) {
            int units = 0;
            for (Option o : g.options()) {
                Integer q = quantities.get(o.id());
                if (q == null) {
                    continue;
                }
                units += q;
                position++;
                Chosen c = new Chosen(position, g.name(), o.id(), o.name(), q, o.priceDelta());
                chosen.add(c);
                perUnit = perUnit.add(c.amount());
            }
            if (units > g.maxSelect()) {
                throw new BusinessRuleException(g.maxSelect() == 1
                        ? "En " + g.name() + " de " + productName + " se elige una sola opción."
                        : "En " + g.name() + " de " + productName + " se eligen hasta " + g.maxSelect() + ".");
            }
            if (requireMinimum && units < g.minSelect()) {
                throw new BusinessRuleException(g.minSelect() == 1
                        ? "Elige " + g.name() + " para " + productName + "."
                        : "Elige al menos " + g.minSelect() + " en " + g.name() + " para " + productName + ".");
            }
        }
        return chosen.isEmpty() ? Result.NONE : new Result(List.copyOf(chosen), perUnit);
    }
}
