package com.poshibrido.tenancy.infrastructure;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * Spring Boot aplica este {@link TaskDecorator} al ejecutor de tareas autoconfigurado.
 */
@EnableAsync
@Configuration(proxyBeanMethods = false)
public class AsyncConfig {

    @Bean
    public TaskDecorator tenantAwareTaskDecorator() {
        return new TenantAwareTaskDecorator();
    }
}
