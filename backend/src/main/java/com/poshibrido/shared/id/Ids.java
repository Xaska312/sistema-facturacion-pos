package com.poshibrido.shared.id;

import java.security.SecureRandom;
import java.util.UUID;

/**
 * Generador de UUID v7 (RFC 9562): 48 bits de timestamp en milisegundos + aleatorio.
 * Son ordenables por tiempo, lo que mejora la localidad de los índices B-tree.
 */
public final class Ids {

    private static final SecureRandom RANDOM = new SecureRandom();

    private Ids() {
    }

    public static UUID newId() {
        long millis = System.currentTimeMillis();
        long randA = RANDOM.nextLong() & 0x0FFFL;                // 12 bits
        long randB = RANDOM.nextLong() & 0x3FFF_FFFF_FFFF_FFFFL; // 62 bits

        long msb = (millis & 0xFFFF_FFFF_FFFFL) << 16 | 0x7000L | randA;
        long lsb = 0x8000_0000_0000_0000L | randB;
        return new UUID(msb, lsb);
    }
}
