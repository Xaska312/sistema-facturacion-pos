package com.poshibrido.tenancy;

import com.poshibrido.tenancy.domain.TenantSchemas;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TenantSchemasTest {

    @ParameterizedTest
    @ValueSource(strings = {"abc", "tienda_1", "drogueria_la_esquina"})
    void acceptsValidSlugs(String slug) {
        assertThat(TenantSchemas.isValidSlug(slug)).isTrue();
        assertThat(TenantSchemas.schemaForSlug(slug)).isEqualTo("t_" + slug);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "ab", "1abc", "Abc", "a-b-c", "abc;drop", "a bc", "abcdefghijklmnopqrstuvwxyzabcdefghijklmnop"})
    void rejectsInvalidSlugs(String slug) {
        assertThat(TenantSchemas.isValidSlug(slug)).isFalse();
        assertThatThrownBy(() -> TenantSchemas.schemaForSlug(slug)).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"platform", "public", "tenant_template", "t_ab", "t_x; DROP", "T_abc"})
    void tenantSchemaGuardRejectsAnythingElse(String schema) {
        assertThatThrownBy(() -> TenantSchemas.requireTenantSchema(schema))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
