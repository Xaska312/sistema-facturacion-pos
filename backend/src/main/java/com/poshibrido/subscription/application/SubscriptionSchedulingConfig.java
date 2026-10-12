package com.poshibrido.subscription.application;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Tareas programadas (avisos diarios de suscripción). Se apagan con {@code app.subscription.reminders-enabled=false}
 * (las pruebas llaman {@link SubscriptionReminders#sendDue()} directamente). Con varias instancias del backend el
 * aviso no se repite (actualización condicionada), pero cada una consultaría la tabla.
 */
@Configuration
@EnableScheduling
public class SubscriptionSchedulingConfig {
}
