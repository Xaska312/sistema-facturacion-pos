package com.poshibrido.audit.application;

import com.fasterxml.jackson.annotation.JsonRawValue;

import java.time.Instant;
import java.util.UUID;

/** Vistas de la consulta de auditoría del negocio. */
public final class AuditViews {

    private AuditViews() {
    }

    /**
     * Fila del listado.
     *
     * @param actorName nombre del miembro (nulo si la acción no tiene autor, p. ej. una tarea del sistema)
     * @param label     nombre legible del registro afectado (nombre, número, código o correo), si lo hay
     */
    public record Entry(UUID id, Instant createdAt, UUID actorId, String actorName, String action, String entity,
                        String entityId, String label, String ip, boolean hasData) {
    }

    /** Detalle con los datos antes y después del cambio (JSON tal como se guardó; nulos si no aplica). */
    public record Detail(UUID id, Instant createdAt, UUID actorId, String actorName, String action, String entity,
                         String entityId, String label, String ip,
                         @JsonRawValue String before, @JsonRawValue String after) {
    }

    /** Combinación de módulo y acción presente en la auditoría (para los filtros). */
    public record ActionOption(String entity, String action, long count) {
    }

    /** Persona que aparece como autor en la auditoría (para los filtros). */
    public record ActorOption(UUID id, String name) {
    }
}
