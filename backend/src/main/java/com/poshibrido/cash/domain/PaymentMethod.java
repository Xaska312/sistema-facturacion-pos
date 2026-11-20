package com.poshibrido.cash.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/** Medio de pago. Los pagos de un medio con {@code affectsCash} entran al efectivo de la caja. */
@Getter
@Entity
@Table(name = "payment_methods")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaymentMethod {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(name = "affects_cash", nullable = false)
    private boolean affectsCash;

    @Column(name = "requires_reference", nullable = false)
    private boolean requiresReference;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(nullable = false)
    private boolean active;

    /** Medios que cada negocio puede prender o apagar (decisión 366); los demás los usa la app y quedan fijos. */
    public static final java.util.Set<String> OPTIONAL = java.util.Set.of("ADDI", "SISTECREDITO");
    /** Prefijo del código de los medios que crea el negocio (decisión 367). */
    public static final String CUSTOM_PREFIX = "OTRO_";

    public boolean isOptional() {
        return OPTIONAL.contains(code) || isCustom();
    }

    public boolean isCustom() {
        return code != null && code.startsWith(CUSTOM_PREFIX);
    }

    /** Un medio que agrega el negocio (SU+ Pay, Bold…): no entra al efectivo de la caja (decisión 367). */
    public static PaymentMethod custom(UUID id, String code, String name, boolean requiresReference, int sortOrder) {
        PaymentMethod m = new PaymentMethod();
        m.id = id;
        m.code = code;
        m.name = name;
        m.affectsCash = false;
        m.requiresReference = requiresReference;
        m.sortOrder = sortOrder;
        m.active = true;
        return m;
    }

    public void rename(String name) {
        this.name = name;
    }

    public void setRequiresReference(boolean requiresReference) {
        this.requiresReference = requiresReference;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
