package com.poshibrido.dining.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Vistas de estaciones y comandas (Fase 12b-3, decisión 270). */
public final class KitchenViews {

    private KitchenViews() {
    }

    public record Ref(UUID id, String name) {
    }

    /** Estación (Cocina, Bar…) con los productos y categorías que tiene asignados. */
    public record StationView(UUID id, String name, boolean main, int position, boolean active,
                              List<Ref> categories, List<Ref> products) {
    }

    /**
     * Adición en la comanda. {@code highlight}: es la elección de un grupo obligatorio de una sola opción (el término
     * de la carne, el tamaño), que la cocina no puede pasar por alto.
     */
    public record TicketModifier(String groupName, String name, int quantity, boolean highlight) {
    }

    public record TicketItem(UUID id, String name, BigDecimal quantity, String note, List<TicketModifier> modifiers,
                             boolean voided) {
    }

    /**
     * Comanda: lo que se envió de una cuenta a una estación de una vez. {@code tabLabel}: la cuenta como estaba al
     * enviar; {@code kind}, {@code guests} y {@code notes}: los de la cuenta ahora.
     */
    public record TicketView(UUID id, long number, UUID branchId, UUID tabId, String tabLabel, String kind,
                             Integer guests, String notes, UUID stationId, String stationName, Instant sentAt,
                             String sentByName, String status, int printCount, List<TicketItem> items) {
    }

    /** Comanda vista desde la cuenta. */
    public record TicketSummary(UUID id, long number, String stationName, Instant sentAt, int printCount, int items) {
    }
}
