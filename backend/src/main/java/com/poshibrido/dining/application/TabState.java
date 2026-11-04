package com.poshibrido.dining.application;

/**
 * En qué va una mesa ocupada, para el color del mapa (decisión 284). En orden: pidió la cuenta (BILL), platos listos
 * para llevar (READY), algo en cocina (KITCHEN), todavía sin pedir a cocina (ORDERING) o comiendo (EATING). Sin el
 * módulo de cocina no hay comandas: con productos está comiendo, sin productos está pidiendo.
 */
final class TabState {

    private TabState() {
    }

    static String of(boolean billRequested, int readyTickets, int pendingTickets, int lines, int sentLines,
                     boolean kitchenOn) {
        if (billRequested) {
            return "BILL";
        }
        if (readyTickets > 0) {
            return "READY";
        }
        if (pendingTickets > 0) {
            return "KITCHEN";
        }
        if (kitchenOn) {
            return sentLines > 0 ? "EATING" : "ORDERING";
        }
        return lines > 0 ? "EATING" : "ORDERING";
    }
}
