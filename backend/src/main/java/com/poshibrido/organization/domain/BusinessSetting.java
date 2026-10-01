package com.poshibrido.organization.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/** Ajuste del negocio (clave/valor tipado). */
@Getter
@Entity
@Table(name = "business_settings")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BusinessSetting {

    public enum ValueType {
        STRING, BOOLEAN, INTEGER, DECIMAL
    }

    @Id
    @Column(name = "setting_key")
    private String key;

    @Column(name = "setting_value", nullable = false)
    private String value;

    @Enumerated(EnumType.STRING)
    @Column(name = "value_type", nullable = false)
    private ValueType type;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "updated_by")
    private UUID updatedBy;

    public static BusinessSetting of(String key, ValueType type, String value, UUID actor) {
        BusinessSetting setting = new BusinessSetting();
        setting.key = key;
        setting.type = type;
        setting.change(value, actor);
        return setting;
    }

    public void change(String newValue, UUID actor) {
        this.value = newValue;
        this.updatedAt = Instant.now();
        this.updatedBy = actor;
    }
}
