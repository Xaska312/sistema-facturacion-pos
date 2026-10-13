package com.poshibrido.organization;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Fase 8c: color de la paleta y logo del negocio. */
class BrandingIT extends IntegrationTest {

    /** PNG de 1×1 px. */
    private static final String PNG = "data:image/png;base64,"
            + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    @Test
    void ownerSetsColorAndLogoAndEveryMemberReadsThem() throws Exception {
        Owned owner = api.newTenant("marca");
        Session s = owner.tenant();
        api.getWith(s, "/api/v1/branding").andExpect(status().isOk())
                .andExpect(jsonPath("$.color").value("indigo"))
                .andExpect(jsonPath("$.logo").value(nullValue()));

        api.putWith(s, "/api/v1/branding/color", """
                {"color":"Azul"}""").andExpect(status().isOk()).andExpect(jsonPath("$.color").value("azul"));
        api.putWith(s, "/api/v1/branding/logo", """
                {"dataUrl":"%s"}""".formatted(PNG)).andExpect(status().isOk())
                .andExpect(jsonPath("$.logo").value(startsWith("data:image/png;base64,iVBOR")));

        // Un cajero la ve (encabezado, POS, tiquete) pero no la cambia.
        Joined cashier = api.joinAs(s, owner.tenantId(), "CASHIER");
        api.getWith(cashier.session(), "/api/v1/branding").andExpect(status().isOk())
                .andExpect(jsonPath("$.color").value("azul"));
        api.putWith(cashier.session(), "/api/v1/branding/color", """
                {"color":"rosa"}""").andExpect(status().isForbidden());

        api.deleteWith(s, "/api/v1/branding/logo").andExpect(status().isOk())
                .andExpect(jsonPath("$.logo").value(nullValue()));
    }

    @Test
    void onlyPaletteColorsAndRealImagesAreAccepted() throws Exception {
        Session s = api.newTenant("marca2").tenant();
        api.putWith(s, "/api/v1/branding/color", """
                {"color":"#ff0000"}""").andExpect(status().is(422));
        // Un SVG (o cualquier cosa que no sea PNG, JPG o WebP) se rechaza aunque diga image/png.
        String svg = Base64.getEncoder().encodeToString("<svg onload=\"alert(1)\"/>".getBytes());
        api.putWith(s, "/api/v1/branding/logo", """
                {"dataUrl":"data:image/png;base64,%s"}""".formatted(svg)).andExpect(status().is(422));
        api.putWith(s, "/api/v1/branding/logo", """
                {"dataUrl":"no es una imagen"}""").andExpect(status().is(422));
        // Más de 150 KB
        String big = Base64.getEncoder().encodeToString(new byte[160 * 1024]);
        api.putWith(s, "/api/v1/branding/logo", """
                {"dataUrl":"data:image/png;base64,%s"}""".formatted(big)).andExpect(status().is4xxClientError());
    }
}
