-- Decisión 303: el QR de la llave Bre-B (lo da el banco) se muestra en la pantalla de pago.
ALTER TABLE platform.billing_settings
    ADD COLUMN qr_image BYTEA,
    ADD COLUMN qr_type  VARCHAR(20);
