-- Fase 11: el administrador de plataforma elimina definitivamente un negocio suspendido (decisión 262).
-- Se borra su schema (todos sus datos) y sus membresías e invitaciones; la ficha queda como DELETED, sin datos de sus
-- clientes, para la auditoría (quién, cuándo, por qué) y para que la suscripción y los pagos sigan teniendo dueño.
ALTER TABLE platform.tenants DROP CONSTRAINT ck_tenants_status;
ALTER TABLE platform.tenants
    ADD CONSTRAINT ck_tenants_status CHECK (status IN ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'FAILED', 'DELETED'));

ALTER TABLE platform.tenants
    ADD COLUMN deleted_at      TIMESTAMPTZ,
    ADD COLUMN deleted_by      UUID,
    ADD COLUMN deletion_reason VARCHAR(300);

ALTER TABLE platform.tenants
    ADD CONSTRAINT ck_tenants_deletion CHECK (
        (status = 'DELETED' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND deletion_reason IS NOT NULL)
        OR (status <> 'DELETED' AND deleted_at IS NULL AND deleted_by IS NULL AND deletion_reason IS NULL));
