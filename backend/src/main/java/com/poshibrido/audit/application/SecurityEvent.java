package com.poshibrido.audit.application;

/**
 * Eventos de seguridad de la plataforma ({@code platform.security_events}): ocurren fuera de un negocio o antes
 * de elegirlo, por eso no van en el {@code audit_log} de cada negocio.
 */
public enum SecurityEvent {
    /** Cuenta creada. */
    REGISTERED,
    LOGIN_SUCCEEDED,
    /** {@code details.reason}: UNKNOWN_EMAIL, BAD_PASSWORD, LOCKED o INACTIVE. */
    LOGIN_FAILED,
    /** La cuenta quedó bloqueada por intentos fallidos ({@code details.until}). */
    ACCOUNT_LOCKED,
    LOGOUT,
    /** Entró a un negocio (también queda SESSION_STARTED en la auditoría del negocio). */
    TENANT_ENTERED,
    /** Intentó entrar a un negocio sin membresía activa, o el negocio o el miembro no están activos. */
    TENANT_ACCESS_DENIED,
    /** Se usó un refresh token ya rotado o revocado: posible robo de la cookie; se cierran todas sus sesiones. */
    REFRESH_TOKEN_REUSED,
    /** Una IP superó el límite de intentos ({@code details.path}). Uno por IP y ventana de un minuto. */
    RATE_LIMITED,
    TENANT_CREATED,
    TENANT_PROVISIONING_FAILED,
    /** El administrador de plataforma suspendió el negocio ({@code details.reason}). */
    TENANT_SUSPENDED,
    TENANT_REACTIVATED,
    /** El dueño cerró ("eliminó") su negocio: queda suspendido y solo el administrador lo reactiva. */
    TENANT_CLOSED,
    /** Intento de cerrar un negocio con la contraseña equivocada (posible sesión robada). */
    TENANT_CLOSE_DENIED,
    /** Confirmó su correo con el enlace. */
    EMAIL_VERIFIED,
    /** Pidió restablecer la contraseña (con {@code user_id} nulo si el correo no existe). */
    PASSWORD_RESET_REQUESTED,
    /** Cambió la contraseña con el enlace del correo (se cierran todas sus sesiones). */
    PASSWORD_RESET
}
