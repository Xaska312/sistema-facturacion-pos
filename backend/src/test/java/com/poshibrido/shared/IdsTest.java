package com.poshibrido.shared;

import com.poshibrido.shared.id.Ids;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class IdsTest {

    @Test
    void generatesVersion7Rfc9562Uuids() {
        UUID id = Ids.newId();
        assertThat(id.version()).isEqualTo(7);
        assertThat(id.variant()).isEqualTo(2);
    }

    @Test
    void idsAreUniqueAndOrderedByTime() throws InterruptedException {
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            ids.add(Ids.newId());
            Thread.sleep(2);
        }
        assertThat(new HashSet<>(ids)).hasSize(5);
        for (int i = 1; i < ids.size(); i++) {
            assertThat(ids.get(i).getMostSignificantBits() >>> 16)
                    .isGreaterThan(ids.get(i - 1).getMostSignificantBits() >>> 16);
        }
    }
}
