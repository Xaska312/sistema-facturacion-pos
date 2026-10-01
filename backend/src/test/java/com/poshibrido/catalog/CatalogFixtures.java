package com.poshibrido.catalog;

import java.util.UUID;

/** IDs fijos sembrados en todo negocio por db/tenant/V5. */
final class CatalogFixtures {

    static final UUID UND = UUID.fromString("01920000-0000-7000-8000-000000000301");
    static final UUID KG = UUID.fromString("01920000-0000-7000-8000-000000000302");
    static final UUID CJ = UUID.fromString("01920000-0000-7000-8000-000000000308");
    static final UUID PAQ = UUID.fromString("01920000-0000-7000-8000-000000000309");
    static final UUID IVA19 = UUID.fromString("01920000-0000-7000-8000-000000000401");
    static final UUID IVA5 = UUID.fromString("01920000-0000-7000-8000-000000000402");
    static final UUID EXENTO = UUID.fromString("01920000-0000-7000-8000-000000000403");
    static final UUID GENERAL = UUID.fromString("01920000-0000-7000-8000-000000000501");
    static final UUID CONSUMIDOR_FINAL = UUID.fromString("01920000-0000-7000-8000-000000000601");

    private CatalogFixtures() {
    }

    /** Producto simple en UND con IVA 19 %. */
    static String simpleProduct(String sku, String name, String price, String barcode) {
        return """
                {"sku":"%s","name":"%s","baseUnitId":"%s","taxId":"%s","cost":0,"salePrice":%s,
                 "trackInventory":true,"barcodes":[%s]}
                """.formatted(sku, name, UND, IVA19, price,
                barcode == null ? "" : "{\"barcode\":\"" + barcode + "\"}");
    }
}
