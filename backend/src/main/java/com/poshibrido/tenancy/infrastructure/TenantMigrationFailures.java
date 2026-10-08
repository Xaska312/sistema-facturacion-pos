package com.poshibrido.tenancy.infrastructure;

import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Negocios cuyo schema no se pudo migrar al arrancar (QA INV-1). Antes, un negocio con datos que chocaban con una
 * migración nueva hacía fallar el arranque y se caían todos; ahora ese negocio queda sin servicio (como suspendido)
 * hasta corregirlo y reiniciar, y los demás siguen funcionando. Se pierde al reiniciar: cada arranque vuelve a
 * intentarlo.
 */
@Component
public class TenantMigrationFailures {

    private final Set<String> schemas = ConcurrentHashMap.newKeySet();

    public void markFailed(String schema) {
        schemas.add(schema);
    }

    public void markOk(String schema) {
        schemas.remove(schema);
    }

    public boolean isFailed(String schema) {
        return schemas.contains(schema);
    }

    public Set<String> failed() {
        return new TreeSet<>(schemas);
    }
}
