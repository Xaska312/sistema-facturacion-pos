package com.poshibrido.parties.application;

import java.util.Optional;
import java.util.UUID;

/** Clientes del negocio actual para otros módulos (ventas). */
public interface CustomerApi {

    /** Consumidor final sembrado en todo negocio (CC 222222222222). */
    UUID FINAL_CONSUMER_ID = UUID.fromString("01920000-0000-7000-8000-000000000601");

    /** Datos del cliente para identificarlo en la venta. {@code documentType} es el código (CC, NIT…). */
    record CustomerRef(UUID id, String documentType, String documentNumber, Integer verificationDigit, String name,
                       UUID priceListId, boolean active) {
    }

    Optional<CustomerRef> find(UUID customerId);
}
