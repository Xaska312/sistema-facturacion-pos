package com.poshibrido.tenancy.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.EnumSet;
import java.util.Set;

/** Módulos encendidos de un negocio en {@code platform.tenants.modules} ("CREDIT,ORDERS,…"). */
@Converter
public class BusinessModulesConverter implements AttributeConverter<Set<BusinessModule>, String> {

    @Override
    public String convertToDatabaseColumn(Set<BusinessModule> modules) {
        return BusinessModule.format(modules == null ? EnumSet.noneOf(BusinessModule.class) : modules);
    }

    @Override
    public Set<BusinessModule> convertToEntityAttribute(String value) {
        return BusinessModule.parse(value);
    }
}
