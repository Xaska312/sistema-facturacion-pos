-- Decisión 325: recibos de gastos leídos con foto por Aska, con su propio tope al mes (y uno menor en la prueba).
INSERT INTO platform.ai_allowances (code, name, monthly_limit, trial_limit) VALUES
    ('EXPENSE_READS', 'Recibos de gastos leídos con foto', 100, 10);
