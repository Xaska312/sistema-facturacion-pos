-- Decisión 296: "Pregúntale a tu negocio" (XASKA IA).
--   * Permiso ai:ask: lo reciben los roles del sistema menos el Mesero (decisión 293: solo mesas); cada uno solo
--     consulta lo que sus permisos le dejan ver.
--   * ai_questions: cada pregunta como conteo (estado, modelo, tokens y consultas hechas), NUNCA el texto de la
--     pregunta ni de la respuesta. Solo las OK cuentan en el tope del mes.
INSERT INTO permissions (code, module, description) VALUES
    ('ai:ask', 'ai', 'Preguntarle a XASKA IA sobre el negocio (ve solo lo que sus permisos le dejan ver)');

INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, 'ai:ask' FROM roles r
WHERE r.system_role AND r.code <> 'WAITER'
  AND NOT EXISTS (SELECT 1 FROM role_permissions x WHERE x.role_id = r.id AND x.permission_code = 'ai:ask');

CREATE TABLE ai_questions (
    id            UUID PRIMARY KEY,
    status        VARCHAR(12) NOT NULL CHECK (status IN ('OK', 'FAILED', 'UNAVAILABLE')),
    model         VARCHAR(60),
    input_tokens  INTEGER     NOT NULL DEFAULT 0,
    output_tokens INTEGER     NOT NULL DEFAULT 0,
    tool_calls    INTEGER     NOT NULL DEFAULT 0,
    created_by    UUID        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_ai_questions_created ON ai_questions (created_at) WHERE status = 'OK';
