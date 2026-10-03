package com.poshibrido.catalog.application;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Listas de precios para otros módulos (clientes). */
public interface PriceListApi {

    record PriceListRef(UUID id, String code, String name, boolean defaultList, boolean active) {
    }

    Optional<PriceListRef> find(UUID id);

    Map<UUID, PriceListRef> all();
}
