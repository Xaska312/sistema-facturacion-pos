package com.poshibrido.orders;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.IVA19;
import static com.poshibrido.sales.PosTestSupport.TRANSFER;
import static com.poshibrido.sales.PosTestSupport.UND;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Pedidos por encargo: medidas, anticipos, entregas parciales como ventas, anulación y cancelación (decisión 258). */
class OrdersIT extends IntegrationTest {

    static final UUID M2 = UUID.fromString("01920000-0000-7000-8000-000000000311");
    static final UUID DEPOSIT = UUID.fromString("01920000-0000-7000-8000-000000000705");
    static final UUID FINAL_CONSUMER = UUID.fromString("01920000-0000-7000-8000-000000000601");

    private PosTestSupport pos;

    @BeforeEach
    void setUpPos() {
        pos = new PosTestSupport(api);
    }

    @Test
    void marbleOrderWithDepositsPartialDeliveriesVoidAndCancel() throws Exception {
        Owned owner = api.newTenant("pedidos");
        Session s = owner.tenant();
        UUID granite = product(s, "GRANITO", "Granito negro San Gabriel", M2, "300000");
        UUID install = product(s, "INST", "Instalación", UND, "150000");
        UUID lucia = customer(s, "4001", "Lucía", "Pardo");
        String due = today().plusDays(5).toString();

        // Validaciones al crear
        createOrder(s, FINAL_CONSUMER, due, granite, "2.4", "0.6").andExpect(status().is(422));
        createOrder(s, lucia, today().minusDays(1).toString(), granite, "2.4", "0.6").andExpect(status().is(422));
        createOrder(s, lucia, due, install, "1.5", "1").andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("unidades enteras")));

        // Mesón de cocina 2,40 × 0,60 (1,44 m²), mesón de baño 1,20 × 0,50 (0,6 m²) e instalación
        String created = body(api.postWith(s, "/api/v1/orders", """
                {"customerId":"%s","dueDate":"%s","address":"Calle 10 # 5-20","notes":"Llevar silicona blanca",
                 "items":[{"productId":"%s","description":"Mesón cocina","width":2.4,"length":0.6,"unitPrice":300000},
                          {"productId":"%s","description":"Mesón baño","width":1.2,"length":0.5,"unitPrice":300000},
                          {"productId":"%s","quantity":1,"unitPrice":150000}]}
                """.formatted(lucia, due, granite, granite, install)).andExpect(status().isCreated()));
        UUID order = UUID.fromString(JsonPath.read(created, "$.id"));
        assertThat((String) JsonPath.read(created, "$.number")).isEqualTo("PED-1");
        assertThat(number(created, "$.items[0].quantity")).isEqualByComparingTo("1.44");
        assertThat(number(created, "$.total")).isEqualByComparingTo("762000");
        assertThat(number(created, "$.balanceDue")).isEqualByComparingTo("762000");
        assertThat((String) JsonPath.read(created, "$.address")).isEqualTo("Calle 10 # 5-20");
        List<String> itemIds = JsonPath.read(created, "$.items[*].id");

        // Anticipo en efectivo: sin caja no; con caja entra al efectivo. Repetir la clave no cobra dos veces.
        pay(s, order, "300000", CASH, key()).andExpect(status().is(422));
        UUID session = pos.openCash(s, CAJA_1, "0");
        String depositKey = key();
        pay(s, order, "300000", CASH, depositKey).andExpect(status().isCreated());
        String paid = body(pay(s, order, "300000", CASH, depositKey).andExpect(status().isCreated()));
        assertThat(number(paid, "$.deposited")).isEqualByComparingTo("300000");
        assertThat(number(paid, "$.balanceDue")).isEqualByComparingTo("462000");
        pay(s, order, "500000", CASH, key()).andExpect(status().is(422));
        pay(s, order, "1000", DEPOSIT, key()).andExpect(status().is(422));

        // "Anticipo" no se usa en el POS
        pos.sell(s, """
                {"items":[{"productId":"%s","quantity":1}],"payments":[{"paymentMethodId":"%s","amount":150000}]}
                """.formatted(install, DEPOSIT), key()).andExpect(status().is(422));

        // Entrega del mesón de cocina (432.000): se aplican 300.000 de anticipo y se pagan 132.000 en efectivo
        String delivered = body(deliver(s, order, List.of(itemIds.get(0)), """
                [{"paymentMethodId":"%s","amount":150000}]""".formatted(CASH), key()).andExpect(status().isOk()));
        UUID kitchenSale = UUID.fromString(JsonPath.read(delivered, "$.saleId"));
        assertThat((String) JsonPath.read(delivered, "$.order.status")).isEqualTo("OPEN");
        assertThat(number(delivered, "$.order.pendingTotal")).isEqualByComparingTo("330000");
        assertThat(number(delivered, "$.order.depositAvailable")).isEqualByComparingTo("0");
        assertThat((Boolean) JsonPath.read(delivered, "$.order.items[0].delivered")).isTrue();
        String sale = body(api.getWith(s, "/api/v1/sales/" + kitchenSale).andExpect(status().isOk()));
        assertThat(number(sale, "$.total")).isEqualByComparingTo("432000");
        assertThat((String) JsonPath.read(sale, "$.items[0].name")).contains("Mesón cocina");
        List<String> methods = JsonPath.read(sale, "$.payments[*].methodCode");
        assertThat(methods).containsExactly("DEPOSIT", "CASH");
        assertThat(number(sale, "$.changeAmount")).isEqualByComparingTo("18000");
        deliver(s, order, List.of(itemIds.get(0)), "[]", key()).andExpect(status().isConflict());

        String report = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/report"));
        assertThat(number(report, "$.cash.orderPayments")).isEqualByComparingTo("300000");
        assertThat(number(report, "$.cash.expected")).isEqualByComparingTo("432000");

        // Se quita el mesón de baño: queda solo la instalación pendiente
        String edited = body(api.putWith(s, "/api/v1/orders/" + order, """
                {"dueDate":"%s","items":[{"productId":"%s","description":"Instalación cocina","quantity":1,
                 "unitPrice":150000}]}
                """.formatted(today().plusDays(7), install)).andExpect(status().isOk()));
        assertThat(number(edited, "$.total")).isEqualByComparingTo("582000");
        assertThat(number(edited, "$.balanceDue")).isEqualByComparingTo("150000");
        assertThat(((List<?>) JsonPath.read(edited, "$.items")).size()).isEqualTo(2);
        String installItem = JsonPath.read(edited, "$.items[1].id");

        // Paga el resto por transferencia y se entrega sin cobrar nada más
        String settled = body(pay(s, order, "150000", TRANSFER, key()).andExpect(status().isCreated()));
        assertThat(number(settled, "$.balanceDue")).isEqualByComparingTo("0");
        String done = body(deliver(s, order, List.of(installItem), "[]", key()).andExpect(status().isOk()));
        assertThat((String) JsonPath.read(done, "$.order.status")).isEqualTo("DELIVERED");
        UUID installSale = UUID.fromString(JsonPath.read(done, "$.saleId"));
        pay(s, order, "1000", CASH, key()).andExpect(status().isConflict());

        // Anular la venta de la entrega: la instalación vuelve a quedar pendiente con su anticipo
        api.postWith(s, "/api/v1/sales/" + installSale + "/void", "{\"reason\":\"No se instaló\"}")
                .andExpect(status().isOk());
        String reopened = body(api.getWith(s, "/api/v1/orders/" + order).andExpect(status().isOk()));
        assertThat((String) JsonPath.read(reopened, "$.status")).isEqualTo("OPEN");
        assertThat(number(reopened, "$.depositAvailable")).isEqualByComparingTo("150000");
        assertThat((Boolean) JsonPath.read(reopened, "$.items[1].delivered")).isFalse();

        // Cancelar: hay que devolver el anticipo (en efectivo sale de la caja)
        api.postWith(s, "/api/v1/orders/" + order + "/cancel", "{\"reason\":\"El cliente desistió\"}")
                .andExpect(status().is(422));
        String cancelled = body(api.postWith(s, "/api/v1/orders/" + order + "/cancel", """
                {"reason":"El cliente desistió","refundMethodId":"%s"}
                """.formatted(CASH)).andExpect(status().isOk()));
        assertThat((String) JsonPath.read(cancelled, "$.status")).isEqualTo("CANCELLED");
        assertThat(number(cancelled, "$.depositAvailable")).isEqualByComparingTo("0");
        report = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/report"));
        assertThat(number(report, "$.cash.orderPayments")).isEqualByComparingTo("150000");
        assertThat(number(report, "$.cash.expected")).isEqualByComparingTo("282000");
        api.putWith(s, "/api/v1/orders/" + order, """
                {"dueDate":"%s","items":[{"productId":"%s","quantity":1,"unitPrice":150000}]}
                """.formatted(due, install)).andExpect(status().isConflict());

        // Lista y resumen
        api.getWith(s, "/api/v1/orders?filter=ALL&search=lucía").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/orders?filter=ALL&search=PED-1").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/orders").andExpect(jsonPath("$.totalElements").value(0));
        api.getWith(s, "/api/v1/orders/summary").andExpect(jsonPath("$.open").value(0));
    }

    @Test
    void permissionsAndOverdueOrders() throws Exception {
        Owned owner = api.newTenant("pedidos-roles");
        Session s = owner.tenant();
        UUID cake = product(s, "TORTA", "Torta por encargo", UND, "80000");
        UUID ana = customer(s, "5001", "Ana", "Mora");

        Joined cashier = api.joinAs(s, owner.tenantId(), "CASHIER");
        Session c = cashier.session();
        UUID order = id(createOrder(c, ana, today().toString(), cake, null, null).andExpect(status().isCreated()),
                "$.id");
        // Sin caja, el cajero no recibe anticipos ni por transferencia; con caja sí
        pay(c, order, "20000", TRANSFER, key()).andExpect(status().isForbidden());
        UUID register = pos.newRegister(s, api.principalBranchId(s), "CAJA-2");
        pos.openCash(c, register, "0");
        pay(c, order, "20000", CASH, key()).andExpect(status().isCreated());
        api.postWith(c, "/api/v1/orders/" + order + "/cancel", "{\"reason\":\"x\"}").andExpect(status().isForbidden());

        Session accountant = api.joinAs(s, owner.tenantId(), "ACCOUNTANT").session();
        api.getWith(accountant, "/api/v1/orders/" + order).andExpect(status().isOk());
        createOrder(accountant, ana, today().toString(), cake, null, null).andExpect(status().isForbidden());
        Session warehouse = api.joinAs(s, owner.tenantId(), "WAREHOUSE").session();
        api.getWith(warehouse, "/api/v1/orders").andExpect(status().isForbidden());

        // Para hoy: no está atrasado. Si la fecha ya pasó, sí.
        api.getWith(s, "/api/v1/orders/summary").andExpect(jsonPath("$.dueToday").value(1))
                .andExpect(jsonPath("$.overdue").value(0));
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        jdbc.update("UPDATE " + schema + ".orders SET due_date = due_date - 2 WHERE id = ?", order);
        api.getWith(s, "/api/v1/orders?filter=OVERDUE").andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].overdue").value(true));
        String summary = body(api.getWith(s, "/api/v1/orders/summary"));
        assertThat(((Number) JsonPath.read(summary, "$.overdue")).intValue()).isEqualTo(1);
        assertThat(number(summary, "$.balanceDue")).isEqualByComparingTo("60000");
    }

    @Test
    void depositCannotBeForgedAndCancelledDeliveriesCanBeVoided() throws Exception {
        Owned owner = api.newTenant("pedidos-seguridad");
        Session s = owner.tenant();
        UUID cake = product(s, "TORTA", "Torta por encargo", UND, "100000");
        UUID ana = customer(s, "6001", "Ana", "Rey");
        String due = today().plusDays(2).toString();
        pos.openCash(s, CAJA_1, "0");

        // Sin anticipo, "Anticipo" no paga la entrega (antes se aceptaba si no había nada que aplicar)
        UUID bare = id(createOrder(s, ana, due, cake, null, null).andExpect(status().isCreated()), "$.id");
        String bareItem = JsonPath.read(body(api.getWith(s, "/api/v1/orders/" + bare)), "$.items[0].id");
        deliver(s, bare, List.of(bareItem), """
                [{"paymentMethodId":"%s","amount":80000}]""".formatted(DEPOSIT), key())
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("anticipo")));
        // Tampoco sirve para abonar un fiado
        api.postWithHeaders(s, "/api/v1/credit/accounts/" + ana + "/payments", """
                {"amount":1000,"paymentMethodId":"%s"}""".formatted(DEPOSIT), "Idempotency-Key", key())
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("no válido")));

        // Dos tortas (160.000), anticipo de 60.000; se entrega una con 20.000 en efectivo
        String created = body(api.postWith(s, "/api/v1/orders", """
                {"customerId":"%s","dueDate":"%s","items":[{"productId":"%s","description":"Chocolate","quantity":1,
                 "unitPrice":80000},{"productId":"%s","description":"Vainilla","quantity":1,"unitPrice":80000}]}
                """.formatted(ana, due, cake, cake)).andExpect(status().isCreated()));
        UUID order = UUID.fromString(JsonPath.read(created, "$.id"));
        List<String> items = JsonPath.read(created, "$.items[*].id");
        pay(s, order, "60000", CASH, key()).andExpect(status().isCreated());
        String deliveryKey = key();
        String delivered = body(deliver(s, order, List.of(items.get(0)), """
                [{"paymentMethodId":"%s","amount":20000}]""".formatted(CASH), deliveryKey).andExpect(status().isOk()));
        UUID sale = UUID.fromString(JsonPath.read(delivered, "$.saleId"));
        // La misma clave en otro pedido no devuelve esa venta
        deliver(s, bare, List.of(bareItem), "[]", deliveryKey).andExpect(status().isConflict());

        // Se cancela lo pendiente (no queda anticipo) y luego se anula la venta de la entrega
        String cancelled = body(api.postWith(s, "/api/v1/orders/" + order + "/cancel",
                "{\"reason\":\"No recogió la segunda\"}").andExpect(status().isOk()));
        assertThat(number(cancelled, "$.depositAvailable")).isEqualByComparingTo("0");
        api.postWith(s, "/api/v1/sales/" + sale + "/void", "{\"reason\":\"Devolvió la torta\"}")
                .andExpect(status().isOk());
        String afterVoid = body(api.getWith(s, "/api/v1/orders/" + order));
        assertThat((String) JsonPath.read(afterVoid, "$.status")).isEqualTo("CANCELLED");
        assertThat(number(afterVoid, "$.depositAvailable")).isEqualByComparingTo("60000");
        assertThat((Boolean) JsonPath.read(afterVoid, "$.items[0].delivered")).isFalse();

        // El anticipo que volvió se devuelve sobre el pedido cancelado; después ya no hay nada que hacer
        String refunded = body(api.postWith(s, "/api/v1/orders/" + order + "/cancel", """
                {"reason":"Devolución del anticipo","refundMethodId":"%s"}""".formatted(CASH))
                .andExpect(status().isOk()));
        assertThat((String) JsonPath.read(refunded, "$.status")).isEqualTo("CANCELLED");
        assertThat((String) JsonPath.read(refunded, "$.cancelReason")).isEqualTo("No recogió la segunda");
        assertThat(number(refunded, "$.depositAvailable")).isEqualByComparingTo("0");
        api.postWith(s, "/api/v1/orders/" + order + "/cancel", "{\"reason\":\"otra vez\"}")
                .andExpect(status().isConflict());

        // Un pedido atrasado se edita sin moverle la fecha
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        jdbc.update("UPDATE " + schema + ".orders SET due_date = due_date - 5 WHERE id = ?", bare);
        String late = JsonPath.read(body(api.getWith(s, "/api/v1/orders/" + bare)), "$.dueDate");
        api.putWith(s, "/api/v1/orders/" + bare, """
                {"dueDate":"%s","notes":"Sin azúcar","items":[{"productId":"%s","quantity":1,"unitPrice":80000}]}
                """.formatted(late, cake)).andExpect(status().isOk());
        api.putWith(s, "/api/v1/orders/" + bare, """
                {"dueDate":"%s","items":[{"productId":"%s","quantity":1,"unitPrice":80000}]}
                """.formatted(today().minusDays(1), cake)).andExpect(status().is(422));
    }

    // ---------------------------------------------------------------- apoyo

    private LocalDate today() {
        return LocalDate.now(ZoneId.of("America/Bogota"));
    }

    private UUID product(Session s, String sku, String name, UUID unit, String price) throws Exception {
        return id(api.postWith(s, "/api/v1/products", """
                {"sku":"%s","name":"%s","baseUnitId":"%s","taxId":"%s","cost":0,"salePrice":%s,
                 "trackInventory":false}
                """.formatted(sku, name, unit, IVA19, price)).andExpect(status().isCreated()), "$.id");
    }

    private UUID customer(Session s, String document, String first, String last) throws Exception {
        return id(api.postWith(s, "/api/v1/customers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"%s","firstNames":"%s","lastNames":"%s",
                 "phone":"3001234567"}
                """.formatted(document, first, last)).andExpect(status().isCreated()), "$.id");
    }

    private ResultActions createOrder(Session s, UUID customer, String due, UUID product, String width,
                                      String length) throws Exception {
        String size = width == null ? "\"quantity\":1" : "\"width\":%s,\"length\":%s".formatted(width, length);
        return api.postWith(s, "/api/v1/orders", """
                {"customerId":"%s","dueDate":"%s","items":[{"productId":"%s",%s,"unitPrice":80000}]}
                """.formatted(customer, due, product, size));
    }

    private ResultActions pay(Session s, UUID order, String amount, UUID method, String key) throws Exception {
        return api.postWithHeaders(s, "/api/v1/orders/" + order + "/payments", """
                {"amount":%s,"paymentMethodId":"%s"}
                """.formatted(amount, method), "Idempotency-Key", key);
    }

    private ResultActions deliver(Session s, UUID order, List<String> items, String payments, String key)
            throws Exception {
        String ids = String.join(",", items.stream().map(i -> "\"" + i + "\"").toList());
        return api.postWithHeaders(s, "/api/v1/orders/" + order + "/deliver", """
                {"itemIds":[%s],"payments":%s}
                """.formatted(ids, payments), "Idempotency-Key", key);
    }
}
