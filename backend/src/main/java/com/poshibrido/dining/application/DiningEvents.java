package com.poshibrido.dining.application;

import java.util.Set;
import java.util.UUID;

/**
 * Avisos en tiempo real de mesas y cocina (Fase 12b-4, decisión 271). Solo dicen "qué cambió" (tipo e ids); las
 * pantallas vuelven a pedir los datos con sus permisos. Detrás de esta interfaz hoy hay un distribuidor en memoria
 * (un solo servidor); se puede cambiar por LISTEN/NOTIFY de PostgreSQL sin tocar a quien publica.
 */
public interface DiningEvents {

    /** Tipos de aviso. */
    enum Type {
        /** Se abrió, cambió, movió, unió, canceló o cobró una cuenta (el salón se actualiza). */
        TAB_CHANGED,
        /** Salió una comanda nueva (cocina e impresoras). */
        TICKET_SENT,
        /** Una comanda cambió de estado (Preparando, Lista, Entregada). */
        TICKET_STATUS,
        /** Se anuló un producto que ya había salido a cocina. */
        ITEM_VOIDED
    }

    /**
     * Aviso de un negocio y una sucursal. {@code userId}: en TICKET_STATUS a "Lista", quien envió la comanda (a quien se
     * le avisa con sonido); en los demás, quien hizo el cambio. {@code status}: el estado nuevo de la comanda.
     */
    record Event(UUID tenantId, UUID branchId, Type type, UUID tabId, UUID ticketId, Long number, UUID stationId,
                 String label, String status, UUID userId) {
    }

    /** Publica el aviso cuando la transacción en curso se confirma (si no hay transacción, de una vez). */
    void publish(Event event);

    /** Suscriptor de un negocio que ve estas sucursales. */
    interface Listener {
        UUID tenantId();

        Set<UUID> branchIds();

        /** Devuelve false si el suscriptor ya no está (se quita). */
        boolean deliver(Event event);
    }

    void subscribe(Listener listener);

    void unsubscribe(Listener listener);
}
