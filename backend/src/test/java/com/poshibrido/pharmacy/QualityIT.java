package com.poshibrido.pharmacy;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Calidad de la droguería (decisión 287): puntos de control con rangos, lecturas de mañana y tarde (fuera de rango pide
 * qué se hizo; no se repiten), eventos adversos con su reporte al INVIMA y el informe para la visita.
 */
class QualityIT extends IntegrationTest {

    @Test
    void temperatureHumidityAdverseEventsAndVisitReport() throws Exception {
        Owned owner = api.newTenant("calidad");
        Session retail = owner.tenant();
        api.getWith(retail, "/api/v1/pharmacy/quality/today").andExpect(status().isForbidden());
        // Farmacia ya se elige como cualquier tipo (decisión 287).
        api.putWith(retail, "/api/v1/business-profile", "{\"businessType\":\"PHARMACY\",\"modules\":[\"MEDICINES\"]}")
                .andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(retail.refreshToken()).andExpect(status().isOk()).andReturn());

        api.getWith(s, "/api/v1/pharmacy/quality/today").andExpect(status().isOk())
                .andExpect(jsonPath("$.points.length()").value(0)).andExpect(jsonPath("$.missing.length()").value(0));
        String points = "/api/v1/pharmacy/quality/points";
        UUID local = id(api.postWith(s, points, """
                {"name":"Local","kind":"ROOM","tempMin":15,"tempMax":30,"humidityMin":35,"humidityMax":70}""")
                .andExpect(status().isCreated()), "$.id");
        UUID fridge = id(api.postWith(s, points, """
                {"name":"Nevera","kind":"FRIDGE","tempMin":2,"tempMax":8,"humidityMin":10,"humidityMax":90}""")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.humidityMax").doesNotExist()), "$.id");
        api.postWith(s, points, "{\"name\":\"local\",\"kind\":\"ROOM\",\"tempMin\":15,\"tempMax\":30,"
                + "\"humidityMin\":35,\"humidityMax\":70}").andExpect(status().isConflict());
        api.postWith(s, points, "{\"name\":\"Bodega\",\"kind\":\"ROOM\",\"tempMin\":30,\"tempMax\":15,"
                + "\"humidityMin\":35,\"humidityMax\":70}").andExpect(status().is(422));
        api.postWith(s, points, "{\"name\":\"Bodega\",\"kind\":\"ROOM\",\"tempMin\":15,\"tempMax\":30}")
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("humedad")));

        // Quién: la auxiliar de farmacia sí; bodega no.
        Session warehouse = api.joinAs(s, owner.tenantId(), "WAREHOUSE").session();
        api.getWith(warehouse, "/api/v1/pharmacy/quality/today").andExpect(status().isForbidden());
        Session assistant = api.joinAs(s, owner.tenantId(), "PHARMACY_ASSISTANT").session();

        api.getWith(assistant, "/api/v1/pharmacy/quality/today")
                .andExpect(jsonPath("$.points.length()").value(2))
                .andExpect(jsonPath("$.missing", hasItem("Local · mañana")))
                .andExpect(jsonPath("$.missing", hasItem("Nevera · mañana")));
        String readings = "/api/v1/pharmacy/quality/readings";
        api.postWith(assistant, readings, "{\"pointId\":\"%s\",\"shift\":\"MORNING\",\"temperature\":24}".formatted(local))
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("humedad")));
        api.postWith(assistant, readings, """
                {"pointId":"%s","shift":"MORNING","temperature":24.3,"humidity":61}""".formatted(local))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.outOfRange").value(false));
        api.postWith(assistant, readings, """
                {"pointId":"%s","shift":"MORNING","temperature":25,"humidity":60}""".formatted(local))
                .andExpect(status().isConflict());
        api.postWith(assistant, readings, "{\"pointId\":\"%s\",\"shift\":\"MORNING\",\"temperature\":10}"
                .formatted(fridge)).andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("qué se hizo")));
        api.postWith(assistant, readings, """
                {"pointId":"%s","shift":"MORNING","temperature":10,"actionTaken":"Se cerró bien la puerta y se bajó el termostato"}"""
                .formatted(fridge)).andExpect(status().isCreated()).andExpect(jsonPath("$.outOfRange").value(true));
        api.getWith(assistant, "/api/v1/pharmacy/quality/today")
                .andExpect(jsonPath("$.points[0].morning").exists())
                .andExpect(jsonPath("$.missing", org.hamcrest.Matchers.not(hasItem("Local · mañana"))));
        api.getWith(s, readings).andExpect(jsonPath("$.length()").value(2));

        // Evento adverso: se registra y luego se anota el reporte al INVIMA.
        LocalDate today = LocalDate.now(ZoneId.of("America/Bogota"));
        String event = body(api.postWith(assistant, "/api/v1/pharmacy/adverse-events", """
                {"occurredOn":"%s","patientName":"Rosa Díaz","patientAge":67,"productName":"Amoxicilina 500 mg",
                 "lotNumber":"L-123","description":"Brote en la piel después de la segunda dosis","serious":false}"""
                .formatted(today)).andExpect(status().isCreated()));
        UUID eventId = UUID.fromString(JsonPath.read(event, "$.id"));
        api.putWith(assistant, "/api/v1/pharmacy/adverse-events/%s/report".formatted(eventId),
                "{\"reportedOn\":\"%s\"}".formatted(today.plusDays(1))).andExpect(status().is(422));
        api.putWith(assistant, "/api/v1/pharmacy/adverse-events/%s/report".formatted(eventId),
                "{\"reportedOn\":\"%s\",\"invimaReference\":\"FOREAM-2026-77\"}".formatted(today))
                .andExpect(status().isOk()).andExpect(jsonPath("$.invimaReference").value("FOREAM-2026-77"));

        // Informe para la visita: todo junto.
        String report = body(api.getWith(s, "/api/v1/pharmacy/visit-report?from=" + today + "&to=" + today)
                .andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(report, "$.quality.readings.length()")).isEqualTo(2);
        assertThat((Integer) JsonPath.read(report, "$.quality.outOfRange")).isEqualTo(1);
        assertThat((Integer) JsonPath.read(report, "$.quality.expected")).isGreaterThanOrEqualTo(2);
        assertThat((Integer) JsonPath.read(report, "$.adverseEvents.length()")).isEqualTo(1);
        assertThat((String) JsonPath.read(report, "$.establishment.businessName")).isNotBlank();
        assertThat((Integer) JsonPath.read(report, "$.dispensations.total")).isZero();
        List<String> actions = List.of("QUALITY_POINT_CREATED", "QUALITY_READING_RECORDED", "ADVERSE_EVENT_RECORDED",
                "ADVERSE_EVENT_REPORTED");
        for (String action : actions) {
            api.getWith(s, "/api/v1/audit?action=" + action).andExpect(jsonPath("$.totalElements").value(
                    action.equals("ADVERSE_EVENT_RECORDED") || action.equals("ADVERSE_EVENT_REPORTED") ? 1 : 2));
        }
    }
}
