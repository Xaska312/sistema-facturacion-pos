package com.poshibrido.catalog.application;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Adiciones de los productos (Fase 12b-1) para la venta: los grupos activos que aplican a cada producto (los suyos y
 * los de su categoría) con sus opciones activas.
 */
public interface ModifierApi {

    record Option(UUID id, String name, BigDecimal priceDelta, int maxQuantity) {
    }

    /** {@code minSelect} > 0 = obligatorio; {@code maxSelect} cuenta las unidades elegidas en el grupo. */
    record Group(UUID id, String name, int minSelect, int maxSelect, List<Option> options) {
    }

    /** Por producto, sus grupos en el orden en que se eligen (obligatorios primero). Sin grupos, no aparece. */
    Map<UUID, List<Group>> activeGroupsFor(Collection<UUID> productIds);
}
