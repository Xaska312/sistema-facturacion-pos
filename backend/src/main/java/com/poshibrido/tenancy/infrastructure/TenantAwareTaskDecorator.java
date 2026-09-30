package com.poshibrido.tenancy.infrastructure;

import com.poshibrido.tenancy.application.TenantRef;
import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;

import java.util.Map;

/**
 * Propaga el tenant y el MDC al hilo que ejecuta una tarea {@code @Async}.
 */
public class TenantAwareTaskDecorator implements TaskDecorator {

    @Override
    public Runnable decorate(Runnable runnable) {
        TenantRef tenant = TenantContext.current().orElse(null);
        Map<String, String> mdc = MDC.getCopyOfContextMap();
        return () -> {
            if (tenant != null) {
                TenantContext.set(tenant);
            }
            if (mdc != null) {
                MDC.setContextMap(mdc);
            }
            try {
                runnable.run();
            } finally {
                TenantContext.clear();
                MDC.clear();
            }
        };
    }
}
