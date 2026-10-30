package com.poshibrido.dining.application;

import java.util.Map;
import java.util.Set;

/** Estados de una comanda (Fase 12b-4): Nueva → Preparando → Lista → Entregada, con vuelta atrás de un paso. */
final class TicketStatus {

    private static final Map<String, Set<String>> NEXT = Map.of(
            "NEW", Set.of("PREPARING", "READY"),
            "PREPARING", Set.of("READY", "NEW"),
            "READY", Set.of("DELIVERED", "PREPARING"),
            "DELIVERED", Set.of("READY"));

    private static final Map<String, String> LABELS = Map.of(
            "NEW", "Nueva", "PREPARING", "Preparando", "READY", "Lista", "DELIVERED", "Entregada");

    private TicketStatus() {
    }

    static boolean allowed(String from, String to) {
        return NEXT.getOrDefault(from, Set.of()).contains(to);
    }

    static String label(String status) {
        return LABELS.getOrDefault(status, status);
    }
}
