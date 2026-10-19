-- =====================================================================
-- Caja compartida (decisión 256; pedido del usuario: "el admin abre en la mañana y la caja se cierra en la noche").
-- - cash_registers.shared: una caja compartida la abre una persona y en ella venden los demás de esa sucursal
--   (se "unen" a la sesión abierta). Una caja personal funciona como antes: cada quien abre la suya.
-- - cash_session_users: quién se unió a qué sesión. Al unirse a otra o al abrir su propia caja, se borra la fila
--   anterior. Las ventas y los movimientos ya guardan quién los hizo (created_by).
-- - La caja que trae todo negocio (CAJA-1) pasa a compartida: en un negocio pequeño hay un solo cajón.
-- =====================================================================

ALTER TABLE cash_registers ADD COLUMN shared BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE cash_registers SET shared = TRUE WHERE id = '01920000-0000-7000-8000-000000000201';

CREATE TABLE cash_session_users (
    cash_session_id  UUID         NOT NULL REFERENCES cash_sessions (id),
    member_id        UUID         NOT NULL REFERENCES members (id),
    joined_at        TIMESTAMPTZ  NOT NULL,
    PRIMARY KEY (cash_session_id, member_id)
);

CREATE INDEX ix_cash_session_users_member ON cash_session_users (member_id);
