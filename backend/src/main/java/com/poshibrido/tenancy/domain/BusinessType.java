package com.poshibrido.tenancy.domain;

import java.util.EnumSet;
import java.util.Set;

import static com.poshibrido.tenancy.domain.BusinessModule.CREDIT;
import static com.poshibrido.tenancy.domain.BusinessModule.KITCHEN;
import static com.poshibrido.tenancy.domain.BusinessModule.MODIFIERS;
import static com.poshibrido.tenancy.domain.BusinessModule.ORDERS;
import static com.poshibrido.tenancy.domain.BusinessModule.QUOTES;
import static com.poshibrido.tenancy.domain.BusinessModule.SCALE;
import static com.poshibrido.tenancy.domain.BusinessModule.TABLES;
import static com.poshibrido.tenancy.domain.BusinessModule.VARIANTS;

/**
 * Tipo de negocio (Fase 12a, decisión 267): se elige al crear el negocio y el dueño lo cambia en Ajustes. Define los
 * módulos que trae por defecto; el dueño puede prender o apagar cada módulo aparte.
 */
public enum BusinessType {
    /** Comercio (tienda, papelería, ropa…): los módulos de siempre; Adiciones se prende en Ajustes (granizados). */
    RETAIL(true, EnumSet.of(CREDIT, ORDERS, QUOTES, VARIANTS, SCALE)),
    /** Farmacia: "Pronto" para el público (Fase 13); el administrador de plataforma la asigna a pilotos. */
    PHARMACY(false, EnumSet.of(CREDIT, ORDERS, QUOTES)),
    /** Restaurante: "Pronto" para el público (Fase 12b); el administrador de plataforma lo asigna a pilotos. */
    RESTAURANT(false, EnumSet.of(CREDIT, ORDERS, MODIFIERS, TABLES, KITCHEN)),
    /** Servicios (taller, impresiones, instalaciones…). */
    SERVICES(true, EnumSet.of(CREDIT, ORDERS, QUOTES));

    private final boolean open;
    private final Set<BusinessModule> defaultModules;

    BusinessType(boolean open, Set<BusinessModule> defaultModules) {
        this.open = open;
        this.defaultModules = defaultModules;
    }

    /** Se puede elegir al crear un negocio o en Ajustes; los demás solo los asigna el administrador de plataforma. */
    public boolean isOpen() {
        return open;
    }

    /** Módulos con que arranca un negocio de este tipo (copia: se puede modificar). */
    public Set<BusinessModule> defaultModules() {
        return EnumSet.copyOf(defaultModules);
    }
}
