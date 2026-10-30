package com.poshibrido.tenancy;

import com.poshibrido.tenancy.domain.BusinessModule;
import com.poshibrido.tenancy.domain.BusinessModulesConverter;
import com.poshibrido.tenancy.domain.BusinessType;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import static com.poshibrido.tenancy.domain.BusinessModule.CREDIT;
import static com.poshibrido.tenancy.domain.BusinessModule.MODIFIERS;
import static com.poshibrido.tenancy.domain.BusinessModule.ORDERS;
import static com.poshibrido.tenancy.domain.BusinessModule.QUOTES;
import static com.poshibrido.tenancy.domain.BusinessModule.SCALE;
import static com.poshibrido.tenancy.domain.BusinessModule.VARIANTS;
import static org.assertj.core.api.Assertions.assertThat;

/** Fase 12a (decisión 267): tipos de negocio, módulos y permisos del token. */
class BusinessModuleTest {

    @Test
    void comercioKeepsEverythingAndComercioServiciosAndRestauranteAreOpen() {
        assertThat(BusinessType.RETAIL.defaultModules()).containsExactlyInAnyOrder(CREDIT, ORDERS, QUOTES, VARIANTS,
                SCALE);
        assertThat(BusinessType.SERVICES.defaultModules()).containsExactlyInAnyOrder(CREDIT, ORDERS, QUOTES);
        assertThat(BusinessType.RESTAURANT.defaultModules()).containsExactlyInAnyOrder(ORDERS, MODIFIERS,
                BusinessModule.TABLES, BusinessModule.KITCHEN);
        assertThat(BusinessType.PHARMACY.defaultModules()).containsExactlyInAnyOrder(CREDIT, ORDERS, QUOTES);
        assertThat(EnumSet.allOf(BusinessType.class).stream().filter(BusinessType::isOpen))
                .containsExactlyInAnyOrder(BusinessType.RETAIL, BusinessType.SERVICES, BusinessType.RESTAURANT);
    }

    @Test
    void defaultModulesAreACopy() {
        Set<BusinessModule> modules = BusinessType.RETAIL.defaultModules();
        modules.clear();
        assertThat(BusinessType.RETAIL.defaultModules()).hasSize(5);
    }

    @Test
    void disabledModulesDropTheirPermissionsAndEnabledOnesAddTheirAuthority() {
        List<String> roles = List.of("sales:create", "credit:read", "credit:collect", "orders:read", "quotes:create",
                "products:manage");
        List<String> perms = BusinessModule.effectivePermissions(roles, EnumSet.of(ORDERS, VARIANTS));
        assertThat(perms).containsExactly("sales:create", "orders:read", "products:manage", "module:orders",
                "module:variants");
    }

    @Test
    void allModulesKeepTheRolePermissionsAsTheyWere() {
        List<String> roles = List.of("credit:manage", "orders:manage", "quotes:read", "audit:read");
        assertThat(BusinessModule.effectivePermissions(roles, EnumSet.allOf(BusinessModule.class)))
                .containsExactly("credit:manage", "orders:manage", "quotes:read", "audit:read", "module:credit",
                        "module:orders", "module:quotes", "module:variants", "module:scale", "module:modifiers",
                        "module:tables", "module:kitchen");
    }

    @Test
    void kitchenNeedsTables() {
        assertThat(BusinessModule.KITCHEN.requires()).contains(BusinessModule.TABLES);
        assertThat(BusinessModule.TABLES.requires()).isEmpty();
        assertThat(BusinessModule.missingRequirement(EnumSet.of(BusinessModule.KITCHEN, CREDIT)))
                .contains(BusinessModule.KITCHEN);
        assertThat(BusinessModule.missingRequirement(EnumSet.of(BusinessModule.KITCHEN, BusinessModule.TABLES)))
                .isEmpty();
        assertThat(BusinessModule.owning("kitchen:send")).contains(BusinessModule.KITCHEN);
    }

    @Test
    void permissionsBelongToTheirModule() {
        assertThat(BusinessModule.owning("credit:collect")).contains(CREDIT);
        assertThat(BusinessModule.owning("quotes:read")).contains(QUOTES);
        assertThat(BusinessModule.owning("sales:create")).isEmpty();
        assertThat(BusinessModule.owning("products:manage")).isEmpty();
    }

    @Test
    void storedAsSortedCodesAndUnknownCodesAreIgnored() {
        BusinessModulesConverter converter = new BusinessModulesConverter();
        assertThat(converter.convertToDatabaseColumn(EnumSet.of(SCALE, CREDIT))).isEqualTo("CREDIT,SCALE");
        assertThat(converter.convertToDatabaseColumn(EnumSet.noneOf(BusinessModule.class))).isEmpty();
        assertThat(converter.convertToEntityAttribute("ORDERS, MESAS,QUOTES")).containsExactlyInAnyOrder(ORDERS, QUOTES);
        assertThat(converter.convertToEntityAttribute("")).isEmpty();
        assertThat(converter.convertToEntityAttribute(null)).isEmpty();
    }
}
