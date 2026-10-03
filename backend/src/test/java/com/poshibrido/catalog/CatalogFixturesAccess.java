package com.poshibrido.catalog;

/** Acceso público a {@link CatalogFixtures} para tests de otros paquetes. */
public final class CatalogFixturesAccess {

    private CatalogFixturesAccess() {
    }

    public static String simpleProduct(String sku, String name, String price) {
        return CatalogFixtures.simpleProduct(sku, name, price, null);
    }

    public static String simpleProduct(String sku, String name, String price, String barcode) {
        return CatalogFixtures.simpleProduct(sku, name, price, barcode);
    }
}
