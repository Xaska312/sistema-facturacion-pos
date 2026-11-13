-- Decisión 349: corregir costos escritos con IVA. Las líneas de venta siguen siendo inmutables, salvo su costo
-- (unit_cost) y solo dentro de la corrección de la app, que lo marca con SET LOCAL xaska.cost_correction = 'on' en su
-- transacción y deja el antes y el después en la auditoría.
CREATE FUNCTION guard_sale_item_change() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF TG_OP = 'UPDATE' AND current_setting('xaska.cost_correction', true) = 'on'
       AND (to_jsonb(NEW) - 'unit_cost') = (to_jsonb(OLD) - 'unit_cost') THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Los registros de % son inmutables', TG_TABLE_NAME USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER trg_sale_items_immutable ON sale_items;
CREATE TRIGGER trg_sale_items_immutable
    BEFORE UPDATE OR DELETE ON sale_items
    FOR EACH ROW EXECUTE FUNCTION guard_sale_item_change();
