-- =====================================================================
-- Decisión 321: Finanzas, parte A2. Gastos fijos (recurrentes).
--   * recurring_expenses: el gasto que se repite (arriendo, nómina, internet) con su valor, categoría, sede, medio de
--     pago y proveedor sugeridos. Cada mes un día (MONTHLY, day_of_month 1–31; en meses cortos, el último día) o cada
--     quincena (BIWEEKLY: el 15 y el último día del mes). No se borra: se apaga.
--   * recurring_expense_occurrences: lo que se hizo con cada fecha: PAID (con el gasto que se registró) o SKIPPED
--     ("Este mes no"). Lo pendiente no se guarda: se calcula desde starts_on. Si el gasto de una fecha pagada se anula,
--     esa fecha vuelve a quedar por pagar.
-- =====================================================================

CREATE TABLE recurring_expenses (
    id                 UUID           PRIMARY KEY,
    name               VARCHAR(80)    NOT NULL,
    category_id        UUID           NOT NULL REFERENCES expense_categories (id),
    branch_id          UUID           NOT NULL REFERENCES branches (id),
    supplier_id        UUID           REFERENCES suppliers (party_id),
    amount             NUMERIC(14,2)  NOT NULL,
    payment_method_id  UUID           NOT NULL REFERENCES payment_methods (id),
    frequency          VARCHAR(10)    NOT NULL,
    day_of_month       SMALLINT,
    starts_on          DATE           NOT NULL,
    note               VARCHAR(255),
    active             BOOLEAN        NOT NULL DEFAULT TRUE,
    created_by         UUID           NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL,
    updated_at         TIMESTAMPTZ    NOT NULL,
    CONSTRAINT ck_recurring_expenses_amount CHECK (amount > 0),
    CONSTRAINT ck_recurring_expenses_frequency CHECK (
        (frequency = 'MONTHLY' AND day_of_month BETWEEN 1 AND 31)
        OR (frequency = 'BIWEEKLY' AND day_of_month IS NULL))
);
CREATE UNIQUE INDEX uq_recurring_expenses_name ON recurring_expenses (lower(name));

CREATE TABLE recurring_expense_occurrences (
    recurring_id  UUID          NOT NULL REFERENCES recurring_expenses (id),
    due_date      DATE          NOT NULL,
    status        VARCHAR(10)   NOT NULL,
    expense_id    UUID          REFERENCES expenses (id),
    done_by       UUID          NOT NULL,
    done_at       TIMESTAMPTZ   NOT NULL,
    PRIMARY KEY (recurring_id, due_date),
    CONSTRAINT uq_recurring_occurrences_expense UNIQUE (expense_id),
    CONSTRAINT ck_recurring_occurrences_status CHECK (
        (status = 'PAID' AND expense_id IS NOT NULL) OR (status = 'SKIPPED' AND expense_id IS NULL))
);
