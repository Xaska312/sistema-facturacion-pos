package com.poshibrido.shared.validation;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.math.BigDecimal;

/**
 * Monto en pesos enteros (QA DIN-2): {@code 10000} y {@code 10000.00} sirven; {@code 10000.50} no. A diferencia de
 * {@code @Digits(fraction = 0)}, no rechaza los ceros decimales que envían otros clientes de la API.
 */
@Documented
@Constraint(validatedBy = WholePesos.Validator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
public @interface WholePesos {

    String message() default "Escribe el valor en pesos, sin centavos.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<WholePesos, BigDecimal> {
        @Override
        public boolean isValid(BigDecimal value, ConstraintValidatorContext context) {
            return value == null || value.stripTrailingZeros().scale() <= 0;
        }
    }
}
