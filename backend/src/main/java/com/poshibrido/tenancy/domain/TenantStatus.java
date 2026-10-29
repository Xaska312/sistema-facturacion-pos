package com.poshibrido.tenancy.domain;

public enum TenantStatus {
    PROVISIONING,
    ACTIVE,
    SUSPENDED,
    FAILED,
    /** Eliminado por el administrador de plataforma: sin schema ni miembros (decisión 262). */
    DELETED
}
