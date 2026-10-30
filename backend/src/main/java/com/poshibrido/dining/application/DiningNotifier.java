package com.poshibrido.dining.application;

import com.poshibrido.dining.application.DiningEvents.Event;
import com.poshibrido.dining.application.DiningEvents.Type;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.application.TenantRef;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** Arma los avisos en tiempo real con el negocio de la petición (Fase 12b-4). */
@Component
@RequiredArgsConstructor
public class DiningNotifier {

    private final DiningEvents events;

    public void tabChanged(UUID branchId, UUID tabId) {
        publish(new Event(null, branchId, Type.TAB_CHANGED, tabId, null, null, null, null, null, actor()));
    }

    public void ticketSent(UUID branchId, UUID tabId, UUID ticketId, long number, UUID stationId, String label) {
        publish(new Event(null, branchId, Type.TICKET_SENT, tabId, ticketId, number, stationId, label, "NEW", actor()));
    }

    /** {@code notify}: a quién avisar (en "Lista", quien envió la comanda). */
    public void ticketStatus(UUID branchId, UUID tabId, UUID ticketId, long number, UUID stationId, String label,
                             String status, UUID notify) {
        publish(new Event(null, branchId, Type.TICKET_STATUS, tabId, ticketId, number, stationId, label, status, notify));
    }

    public void itemVoided(UUID branchId, UUID tabId, UUID ticketId, long number, UUID stationId, String label) {
        publish(new Event(null, branchId, Type.ITEM_VOIDED, tabId, ticketId, number, stationId, label, null, actor()));
    }

    private void publish(Event event) {
        // Sin negocio en la petición no hay a quién avisar (no pasa en las pantallas de mesas).
        TenantContext.current().map(TenantRef::id).ifPresent(tenantId -> events.publish(new Event(tenantId,
                event.branchId(), event.type(), event.tabId(), event.ticketId(), event.number(), event.stationId(),
                event.label(), event.status(), event.userId())));
    }

    private static UUID actor() {
        return CurrentActor.userId().orElse(null);
    }
}
