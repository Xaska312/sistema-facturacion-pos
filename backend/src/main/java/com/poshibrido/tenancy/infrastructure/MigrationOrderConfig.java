package com.poshibrido.tenancy.infrastructure;

import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;

/**
 * Garantiza que las migraciones Flyway se ejecuten antes de construir el EntityManagerFactory.
 */
@Configuration(proxyBeanMethods = false)
public class MigrationOrderConfig {

    private static final String EMF_BEAN = "entityManagerFactory";

    @Bean
    public static BeanFactoryPostProcessor entityManagerFactoryDependsOnMigrator() {
        return beanFactory -> {
            if (!beanFactory.containsBeanDefinition(EMF_BEAN)) {
                return;
            }
            BeanDefinition definition = beanFactory.getBeanDefinition(EMF_BEAN);
            String[] current = definition.getDependsOn();
            String[] updated = current == null
                    ? new String[]{DatabaseMigrator.BEAN_NAME}
                    : appendIfMissing(current);
            definition.setDependsOn(updated);
        };
    }

    private static String[] appendIfMissing(String[] current) {
        if (Arrays.asList(current).contains(DatabaseMigrator.BEAN_NAME)) {
            return current;
        }
        String[] updated = Arrays.copyOf(current, current.length + 1);
        updated[current.length] = DatabaseMigrator.BEAN_NAME;
        return updated;
    }
}
