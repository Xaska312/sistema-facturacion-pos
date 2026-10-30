package com.poshibrido.dining.application;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Fase 12b-4: estados de la comanda y reparto de avisos en tiempo real. */
class TicketStatusTest {

    @Test
    void ticketsMoveForwardAndOneStepBack() {
        assertThat(TicketStatus.allowed("NEW", "PREPARING")).isTrue();
        assertThat(TicketStatus.allowed("NEW", "READY")).isTrue();
        assertThat(TicketStatus.allowed("PREPARING", "READY")).isTrue();
        assertThat(TicketStatus.allowed("READY", "DELIVERED")).isTrue();
        assertThat(TicketStatus.allowed("READY", "PREPARING")).isTrue();
        assertThat(TicketStatus.allowed("NEW", "DELIVERED")).isFalse();
        assertThat(TicketStatus.allowed("DELIVERED", "NEW")).isFalse();
        assertThat(TicketStatus.label("READY")).isEqualTo("Lista");
    }

    @Test
    void eventsOnlyReachTheSameBusinessAndItsBranches() {
        InMemoryDiningEvents hub = new InMemoryDiningEvents();
        UUID tenantA = UUID.randomUUID();
        UUID tenantB = UUID.randomUUID();
        UUID branch = UUID.randomUUID();
        Recorder sameBranch = new Recorder(tenantA, Set.of(branch), true);
        Recorder otherBranch = new Recorder(tenantA, Set.of(UUID.randomUUID()), true);
        Recorder otherBusiness = new Recorder(tenantB, Set.of(branch), true);
        Recorder gone = new Recorder(tenantA, Set.of(branch), false);
        List.of(sameBranch, otherBranch, otherBusiness, gone).forEach(hub::subscribe);

        hub.deliverNow(new DiningEvents.Event(tenantA, branch, DiningEvents.Type.TICKET_SENT, null, null, 1L, null,
                "Mesa 1", "NEW", null));

        assertThat(sameBranch.received).isEqualTo(1);
        assertThat(otherBranch.received).isZero();
        assertThat(otherBusiness.received).isZero();
        // Un navegador que ya no está se quita.
        assertThat(hub.size()).isEqualTo(3);
        hub.stop();
    }

    private static final class Recorder implements DiningEvents.Listener {
        private final UUID tenantId;
        private final Set<UUID> branches;
        private final boolean alive;
        int received;

        Recorder(UUID tenantId, Set<UUID> branches, boolean alive) {
            this.tenantId = tenantId;
            this.branches = branches;
            this.alive = alive;
        }

        @Override
        public UUID tenantId() {
            return tenantId;
        }

        @Override
        public Set<UUID> branchIds() {
            return branches;
        }

        @Override
        public boolean deliver(DiningEvents.Event event) {
            received++;
            return alive;
        }
    }
}
