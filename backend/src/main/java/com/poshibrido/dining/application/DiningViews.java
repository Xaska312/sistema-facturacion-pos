package com.poshibrido.dining.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Vistas de mesas y cuentas abiertas (Fase 12b-2, decisión 269). */
public final class DiningViews {

    private DiningViews() {
    }

    public record BranchOption(UUID id, String name) {
    }

    /**
     * Configuración: zona con todas sus mesas (también las inactivas). {@code cashRegister}: la caja donde quedan las
     * ventas de sus mesas (decisión 285); nula = la caja de quien cobra (lo normal).
     */
    public record ZoneView(UUID id, UUID branchId, String name, int position, boolean active, List<TableView> tables,
                           RegisterOption cashRegister) {
    }

    /** Una caja de la sucursal. {@code open}: tiene un turno abierto ahora. */
    public record RegisterOption(UUID id, String name, boolean open) {
    }

    /** {@code map}: su lugar en el plano de la zona (decisión 284). */
    public record TableView(UUID id, UUID zoneId, String name, Integer seats, int position, boolean active, MapSpot map) {
    }

    /**
     * Lugar de una mesa en el plano (unidades de un plano de 100 × 70): {@code x}/{@code y} nulos = sin ubicar (la
     * pantalla la acomoda); {@code shape}: SQUARE, ROUND o RECT.
     */
    public record MapSpot(BigDecimal x, BigDecimal y, BigDecimal w, BigDecimal h, String shape) {
    }

    /** Resumen de una cuenta abierta para las baldosas. {@code total}: con los precios del momento de agregar. */
    public record TabSummary(UUID id, long number, String kind, String label, UUID tableId, Instant openedAt,
                             Integer guests, String customerName, BigDecimal total, int items, String openedByName,
                             int ready, String state, Instant billRequestedAt) {
    }

    public record FloorTable(UUID id, String name, Integer seats, TabSummary tab, MapSpot map) {
    }

    /** {@code cashRegister}: la caja de la zona (decisión 285), o nula. */
    public record FloorZone(UUID id, String name, List<FloorTable> tables, RegisterOption cashRegister) {
    }

    /**
     * Salón de una sucursal: zonas activas con sus mesas activas y la cuenta abierta de cada una; {@code others}: las
     * cuentas para llevar y domicilios abiertas. {@code branches}: las sucursales que el usuario puede ver.
     */
    public record Floor(UUID branchId, List<BranchOption> branches, List<FloorZone> zones, List<TabSummary> others) {
    }

    public record ItemModifier(UUID optionId, String groupName, String name, int quantity, BigDecimal price) {
    }

    /**
     * Línea de la cuenta. {@code unitPrice}: producto + adiciones al agregar (para mostrar); {@code basePrice}: el del
     * producto sin adiciones (en precio libre, el escrito).
     */
    public record TabItemView(UUID id, int position, UUID productId, UUID unitId, String name, BigDecimal quantity,
                              BigDecimal unitPrice, BigDecimal basePrice, boolean openPrice, String note,
                              List<ItemModifier> modifiers,
                              Instant addedAt, String addedByName, Instant sentAt, Long ticketNumber,
                              String stationName, boolean voided, Instant voidedAt, String voidedByName,
                              String voidReason, UUID saleId) {
    }

    public record TabView(UUID id, long number, String kind, String status, String label, UUID branchId,
                          UUID tableId, String tableName, String zoneName, Integer guests, String customerName,
                          String phone, String address, String notes, Instant openedAt, String openedByName,
                          Instant closedAt, UUID saleId, BigDecimal total, List<TabItemView> items,
                          List<KitchenViews.TicketSummary> tickets, BigDecimal chargedTotal, List<UUID> saleIds,
                          Instant billRequestedAt, RegisterOption chargeRegister) {
    }
}
