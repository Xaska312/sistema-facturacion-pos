package com.poshibrido.dining.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.cash.application.CashApi;
import com.poshibrido.cash.application.CashApi.OpenSession;
import com.poshibrido.catalog.application.ModifierApi;
import com.poshibrido.catalog.application.PricingApi;
import com.poshibrido.catalog.application.PricingApi.ResolvedPrice;
import com.poshibrido.dining.application.DiningViews.ItemModifier;
import com.poshibrido.dining.application.DiningViews.TabItemView;
import com.poshibrido.dining.application.DiningViews.TabView;
import com.poshibrido.sales.application.ModifierChoices;
import com.poshibrido.sales.application.SaleCommands;
import com.poshibrido.sales.application.SaleCommands.ItemLine;
import com.poshibrido.sales.application.SaleCommands.PaymentLine;
import com.poshibrido.sales.application.SaleService;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.domain.BusinessModule;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Cuentas abiertas (Fase 12b-2, decisión 269): de una mesa, para llevar o domicilio. Se abren, se les agregan
 * productos en varios momentos (con adiciones y nota), se mueven de mesa, se unen, se cancelan con motivo y se cobran
 * completas: el cobro las vuelve una venta normal (caja, inventario, tiquete) con el precio vigente. Quitar un producto
 * no lo borra (queda con motivo); lo que ya salió a cocina (Fase 12b-3) necesita {@code tables:void}.
 *
 * <p>Con el módulo de cocina (Fase 12b-3, decisión 270), agregar puede enviar de una vez: lo pedido sale en una comanda
 * por estación ({@code kitchen:send}).
 */
@Service
@RequiredArgsConstructor
public class TabService {

    static final String VOID_PERMISSION = "tables:void";
    static final String OPEN_PRICE_PERMISSION = "sales:open-price";
    static final String SEND_PERMISSION = "kitchen:send";
    static final int MAX_ITEMS_PER_TAB = 200;
    static final int MAX_NOTE = 140;
    private static final BigDecimal MAX_QUANTITY = new BigDecimal("9999");

    private final DiningService dining;
    private final PricingApi pricing;
    private final ModifierApi modifiers;
    private final SaleService sales;
    private final CashApi cash;
    private final MemberDirectory members;
    private final AuditLogger audit;
    private final KitchenService kitchen;
    private final DiningNotifier notifier;

    @PersistenceContext
    private EntityManager em;

    public record OpenCommand(UUID branchId, String kind, UUID tableId, Integer guests, String customerName,
                              String phone, String address, String notes) {
    }

    public record Details(Integer guests, String customerName, String phone, String address, String notes) {
    }

    /** {@code unitPrice}: solo en productos de precio libre (el que se escribe al agregarlo). */
    public record ItemInput(UUID productId, UUID unitId, BigDecimal quantity, BigDecimal unitPrice,
                            List<ModifierChoices.Choice> modifiers, String note) {
    }

    /** Fila de la cuenta bloqueada para cambiarla. */
    private record Tab(UUID id, long number, String kind, UUID tableId, String status, UUID branchId, Integer guests,
                       String customerName, String tableName, UUID saleId) {

        String label() {
            return TabLabels.label(kind, number, tableName, customerName);
        }
    }

    // ------------------------------------------------------------------ consulta

    @Transactional(readOnly = true)
    public TabView get(UUID id) {
        List<Object[]> found = dining.rows("""
                SELECT t.id, t.number, t.kind, t.status, t.branch_id, t.table_id, dt.name, dz.name, t.guests,
                       t.customer_name, t.phone, t.address, t.notes, t.opened_at, t.opened_by, t.closed_at, t.sale_id
                FROM tabs t
                LEFT JOIN dining_tables dt ON dt.id = t.table_id
                LEFT JOIN dining_zones dz ON dz.id = dt.zone_id
                WHERE t.id = :t""", Map.of("t", id));
        if (found.isEmpty()) {
            throw new NotFoundException("Cuenta no encontrada.");
        }
        Object[] r = found.getFirst();
        dining.requireBranch((UUID) r[4]);
        Map<UUID, List<ItemModifier>> mods = new LinkedHashMap<>();
        for (Object[] m : dining.rows("""
                SELECT m.tab_item_id, m.option_id, m.group_name, m.option_name, m.quantity, m.price
                FROM tab_item_modifiers m JOIN tab_items i ON i.id = m.tab_item_id
                WHERE i.tab_id = :t ORDER BY m.tab_item_id, m.position""", Map.of("t", id))) {
            mods.computeIfAbsent((UUID) m[0], k -> new ArrayList<>()).add(new ItemModifier((UUID) m[1], (String) m[2],
                    (String) m[3], ((Number) m[4]).intValue(), DiningService.money(m[5])));
        }
        List<Object[]> itemRows = dining.rows("""
                SELECT i.id, i.position, i.product_id, i.unit_id, i.name, i.quantity, i.unit_price, i.base_price,
                       i.open_price, i.note, i.added_at, i.added_by, i.sent_at, i.voided_at, i.voided_by, i.void_reason,
                       k.number, k.station_name
                FROM tab_items i LEFT JOIN kitchen_tickets k ON k.id = i.ticket_id
                WHERE i.tab_id = :t ORDER BY i.position""", Map.of("t", id));
        Set<UUID> people = new HashSet<>();
        people.add((UUID) r[14]);
        itemRows.forEach(i -> {
            people.add((UUID) i[11]);
            if (i[14] != null) {
                people.add((UUID) i[14]);
            }
        });
        Map<UUID, String> names = members.displayNames(people);
        List<TabItemView> items = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO.setScale(2);
        for (Object[] i : itemRows) {
            UUID itemId = (UUID) i[0];
            BigDecimal quantity = ((BigDecimal) i[5]).setScale(4, RoundingMode.HALF_UP);
            BigDecimal unitPrice = DiningService.money(i[6]);
            boolean voided = i[13] != null;
            if (!voided) {
                total = total.add(unitPrice.multiply(quantity)).setScale(2, RoundingMode.HALF_UP);
            }
            items.add(new TabItemView(itemId, ((Number) i[1]).intValue(), (UUID) i[2], (UUID) i[3], (String) i[4],
                    quantity, unitPrice, DiningService.money(i[7]), (Boolean) i[8], (String) i[9],
                    mods.getOrDefault(itemId, List.of()), Rows.instant(i[10]), names.get((UUID) i[11]), Rows.instant(i[12]),
                    i[16] == null ? null : ((Number) i[16]).longValue(), (String) i[17], voided, Rows.instant(i[13]), i[14] == null ? null : names.get((UUID) i[14]), (String) i[15]));
        }
        long number = ((Number) r[1]).longValue();
        String kind = (String) r[2];
        return new TabView((UUID) r[0], number, kind, (String) r[3], TabLabels.label(kind, number, (String) r[6],
                (String) r[9]), (UUID) r[4], (UUID) r[5], (String) r[6], (String) r[7], Rows.integer(r[8]), (String) r[9],
                (String) r[10], (String) r[11], (String) r[12], Rows.instant(r[13]), names.get((UUID) r[14]),
                Rows.instant(r[15]), (UUID) r[16], total, items, kitchen.ticketsOfTab(id));
    }

    // ------------------------------------------------------------------ abrir y datos

    @Transactional
    public TabView open(OpenCommand c) {
        String kind = c.kind() == null ? "" : c.kind();
        UUID branchId;
        UUID tableId = null;
        switch (kind) {
            case "TABLE" -> {
                if (c.tableId() == null) {
                    throw new BusinessRuleException("Elige la mesa.");
                }
                Object[] table = lockFreeTable(c.tableId());
                branchId = (UUID) table[1];
                tableId = c.tableId();
            }
            case "TAKEAWAY", "DELIVERY" -> branchId = dining.resolveBranch(c.branchId());
            default -> throw new BusinessRuleException("Elige si la cuenta es de una mesa, para llevar o domicilio.");
        }
        dining.requireBranch(branchId);
        Details details = cleanDetails(new Details(c.guests(), c.customerName(), c.phone(), c.address(), c.notes()));
        if ("DELIVERY".equals(kind) && details.address() == null) {
            throw new BusinessRuleException("Escribe la dirección del domicilio.");
        }
        UUID id = Ids.newId();
        em.createNativeQuery("""
                INSERT INTO tabs (id, branch_id, kind, table_id, status, guests, customer_name, phone, address, notes,
                                  opened_by, opened_at, version)
                VALUES (?1, ?2, ?3, ?4, 'OPEN', ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0)""")
                .setParameter(1, id).setParameter(2, branchId).setParameter(3, kind).setParameter(4, tableId)
                .setParameter(5, details.guests()).setParameter(6, details.customerName())
                .setParameter(7, details.phone()).setParameter(8, details.address()).setParameter(9, details.notes())
                .setParameter(10, CurrentActor.requireUserId()).setParameter(11, Instant.now())
                .executeUpdate();
        Tab tab = lock(id);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("label", tab.label());
        data.put("kind", kind);
        data.put("guests", details.guests());
        audit.log("TAB_OPENED", "tab", id, null, data);
        notifier.tabChanged(branchId, id);
        return get(id);
    }

    @Transactional
    public TabView update(UUID id, Details input) {
        Tab tab = lockOpen(id);
        Details details = cleanDetails(input);
        if ("DELIVERY".equals(tab.kind()) && details.address() == null) {
            throw new BusinessRuleException("Escribe la dirección del domicilio.");
        }
        em.createNativeQuery("""
                UPDATE tabs SET guests = ?2, customer_name = ?3, phone = ?4, address = ?5, notes = ?6,
                       version = version + 1 WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, details.guests()).setParameter(3, details.customerName())
                .setParameter(4, details.phone()).setParameter(5, details.address()).setParameter(6, details.notes())
                .executeUpdate();
        audit.log("TAB_UPDATED", "tab", id, Map.of("label", tab.label()), detailsData(details));
        notifier.tabChanged(tab.branchId(), id);
        return get(id);
    }

    // ------------------------------------------------------------------ productos

    /** Agrega lo pedido; con {@code send}, además lo envía a cocina en la misma operación. */
    @Transactional
    public TabView addItems(UUID id, List<ItemInput> inputs, boolean send) {
        Tab tab = lockOpen(id);
        if (inputs == null || inputs.isEmpty()) {
            throw new BusinessRuleException("Agrega al menos un producto.");
        }
        if (send) {
            requireCanSend();
        }
        long current = count("SELECT count(*) FROM tab_items WHERE tab_id = :t", Map.of("t", id));
        if (current + inputs.size() > MAX_ITEMS_PER_TAB) {
            throw new BusinessRuleException("Máximo " + MAX_ITEMS_PER_TAB + " productos por cuenta.");
        }
        boolean modifiersOn = CurrentActor.permissions().contains(BusinessModule.MODIFIERS.authority());
        Set<UUID> productIds = new LinkedHashSet<>();
        inputs.forEach(i -> productIds.add(i.productId()));
        Map<UUID, List<ModifierApi.Group>> groups = modifiersOn ? modifiers.activeGroupsFor(productIds) : Map.of();
        int position = (int) count("SELECT coalesce(max(position), 0) FROM tab_items WHERE tab_id = :t", Map.of("t", id));
        UUID actor = CurrentActor.requireUserId();
        Instant now = Instant.now();
        List<String> added = new ArrayList<>();
        List<UUID> newItems = new ArrayList<>();
        for (ItemInput in : inputs) {
            if (in == null || in.productId() == null || in.quantity() == null) {
                throw new BusinessRuleException("Cada producto necesita su cantidad.");
            }
            ResolvedPrice price = pricing.price(in.productId(), in.unitId(), null);
            BigDecimal quantity = in.quantity().setScale(4, RoundingMode.HALF_UP);
            if (quantity.signum() <= 0 || quantity.compareTo(MAX_QUANTITY) > 0) {
                throw new BusinessRuleException("La cantidad de " + price.name() + " no es válida.");
            }
            BigDecimal base = price.price();
            if (price.openPrice()) {
                // Precio libre (decisión 253): con su permiso y el precio escrito.
                if (!CurrentActor.permissions().contains(OPEN_PRICE_PERMISSION)) {
                    throw new ForbiddenException("Tu usuario no puede vender productos de precio libre (" + price.name()
                            + ").");
                }
                if (in.unitPrice() == null || in.unitPrice().signum() <= 0) {
                    throw new BusinessRuleException("Escribe el precio de " + price.name() + ".");
                }
                base = in.unitPrice().setScale(2, RoundingMode.HALF_UP);
            }
            if (!modifiersOn && in.modifiers() != null && !in.modifiers().isEmpty()) {
                throw new BusinessRuleException("Las adiciones están apagadas en este negocio.");
            }
            ModifierChoices.Result chosen = modifiersOn
                    ? ModifierChoices.resolve(price.name(), groups.get(in.productId()), in.modifiers(), true)
                    : ModifierChoices.Result.NONE;
            String note = in.note() == null || in.note().isBlank() ? null : in.note().trim();
            if (note != null && note.length() > MAX_NOTE) {
                throw new BusinessRuleException("La nota de " + price.name() + " admite hasta " + MAX_NOTE + " caracteres.");
            }
            BigDecimal unitPrice = base.add(chosen.perUnit()).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            UUID itemId = Ids.newId();
            newItems.add(itemId);
            position++;
            em.createNativeQuery("""
                    INSERT INTO tab_items (id, tab_id, position, product_id, unit_id, name, quantity, unit_price,
                                           base_price, open_price, note, added_by, added_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)""")
                    .setParameter(1, itemId).setParameter(2, id).setParameter(3, position)
                    .setParameter(4, in.productId()).setParameter(5, price.unitId()).setParameter(6, price.name())
                    .setParameter(7, quantity).setParameter(8, unitPrice).setParameter(9, base)
                    .setParameter(10, price.openPrice()).setParameter(11, note).setParameter(12, actor)
                    .setParameter(13, now).executeUpdate();
            for (ModifierChoices.Chosen m : chosen.chosen()) {
                em.createNativeQuery("""
                        INSERT INTO tab_item_modifiers (id, tab_item_id, position, group_name, option_id, option_name,
                                                        quantity, price)
                        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)""")
                        .setParameter(1, Ids.newId()).setParameter(2, itemId).setParameter(3, m.position())
                        .setParameter(4, m.groupName()).setParameter(5, m.optionId()).setParameter(6, m.optionName())
                        .setParameter(7, m.quantity()).setParameter(8, m.unitPrice()).executeUpdate();
            }
            added.add(quantity.stripTrailingZeros().toPlainString() + " × " + price.name()
                    + (chosen.chosen().isEmpty() ? "" : " (" + String.join(", ",
                    chosen.chosen().stream().map(ModifierChoices.Chosen::optionName).toList()) + ")"));
        }
        touch(id);
        audit.log("TAB_ITEMS_ADDED", "tab", id, null, Map.of("label", tab.label(), "items", added));
        if (send) {
            kitchen.send(id, tab.label(), tab.branchId(), newItems);
        }
        notifier.tabChanged(tab.branchId(), id);
        return get(id);
    }

    /** Envía a cocina todo lo de la cuenta que no se ha enviado (lo agregado sin enviar o antes de tener cocina). */
    @Transactional
    public TabView sendPending(UUID id) {
        Tab tab = lockOpen(id);
        requireCanSend();
        List<UUID> pending = new ArrayList<>();
        for (Object[] r : dining.rows("""
                SELECT id, position FROM tab_items WHERE tab_id = :t AND sent_at IS NULL AND voided_at IS NULL
                ORDER BY position""", Map.of("t", id))) {
            pending.add((UUID) r[0]);
        }
        if (pending.isEmpty()) {
            throw new BusinessRuleException("No hay nada por enviar a cocina.");
        }
        kitchen.send(id, tab.label(), tab.branchId(), pending);
        touch(id);
        notifier.tabChanged(tab.branchId(), id);
        return get(id);
    }

    private static void requireCanSend() {
        Set<String> permissions = CurrentActor.permissions();
        if (!permissions.contains(BusinessModule.KITCHEN.authority())) {
            throw new BusinessRuleException("La cocina y las comandas están apagadas en este negocio.");
        }
        if (!permissions.contains(SEND_PERMISSION)) {
            throw new ForbiddenException("Tu usuario no puede enviar a cocina.");
        }
    }

    /** Quitar un producto: queda en la cuenta con el motivo; lo que ya salió a cocina necesita {@code tables:void}. */
    @Transactional
    public TabView voidItem(UUID id, UUID itemId, String reason) {
        Tab tab = lockOpen(id);
        String why = requireReason(reason);
        List<Object[]> found = dining.rows("""
                SELECT name, quantity, sent_at, voided_at FROM tab_items WHERE id = :i AND tab_id = :t FOR UPDATE""",
                Map.of("i", itemId, "t", id));
        if (found.isEmpty()) {
            throw new NotFoundException("Producto no encontrado en la cuenta.");
        }
        Object[] item = found.getFirst();
        if (item[3] != null) {
            throw new ConflictException("Ese producto ya se había quitado.");
        }
        if (item[2] != null && !CurrentActor.permissions().contains(VOID_PERMISSION)) {
            throw new ForbiddenException("Ya salió a cocina: pídele a caja o al administrador que lo anule.");
        }
        em.createNativeQuery("""
                UPDATE tab_items SET voided_at = ?2, voided_by = ?3, void_reason = ?4 WHERE id = ?1""")
                .setParameter(1, itemId).setParameter(2, Instant.now()).setParameter(3, CurrentActor.requireUserId())
                .setParameter(4, why).executeUpdate();
        touch(id);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("label", tab.label());
        data.put("item", ((BigDecimal) item[1]).stripTrailingZeros().toPlainString() + " × " + item[0]);
        data.put("sentToKitchen", item[2] != null);
        data.put("reason", why);
        audit.log("TAB_ITEM_VOIDED", "tab", id, null, data);
        if (item[2] != null) {
            // Ya había salido: la cocina se entera en la pantalla y, si imprime, con un aviso de anulación.
            kitchen.itemVoided(itemId);
        }
        notifier.tabChanged(tab.branchId(), id);
        return get(id);
    }

    // ------------------------------------------------------------------ mesas

    /** Pasa la cuenta a otra mesa libre de la misma sucursal (una de para llevar se vuelve de mesa). */
    @Transactional
    public TabView move(UUID id, UUID tableId) {
        Tab tab = lockOpen(id);
        if (tableId == null) {
            throw new BusinessRuleException("Elige la mesa.");
        }
        if (tableId.equals(tab.tableId())) {
            return get(id);
        }
        Object[] table = lockFreeTable(tableId);
        if (!tab.branchId().equals(table[1])) {
            throw new BusinessRuleException("La mesa es de otra sucursal.");
        }
        em.createNativeQuery("UPDATE tabs SET table_id = ?2, kind = 'TABLE', version = version + 1 WHERE id = ?1")
                .setParameter(1, id).setParameter(2, tableId).executeUpdate();
        audit.log("TAB_MOVED", "tab", id, Map.of("label", tab.label()),
                Map.of("label", TabLabels.label("TABLE", tab.number(), (String) table[2], tab.customerName())));
        notifier.tabChanged(tab.branchId(), id);
        return get(id);
    }

    /** Une la cuenta {@code fromId} a esta: sus productos pasan aquí y la otra queda "unida" (y su mesa libre). */
    @Transactional
    public TabView merge(UUID id, UUID fromId) {
        if (fromId == null || fromId.equals(id)) {
            throw new BusinessRuleException("Elige otra cuenta para unir.");
        }
        // Mismo orden de bloqueo siempre (por id) para que dos uniones cruzadas no se bloqueen entre sí.
        Tab a = lockOpen(id.compareTo(fromId) < 0 ? id : fromId);
        Tab b = lockOpen(id.compareTo(fromId) < 0 ? fromId : id);
        Tab target = a.id().equals(id) ? a : b;
        Tab from = a.id().equals(id) ? b : a;
        if (!target.branchId().equals(from.branchId())) {
            throw new BusinessRuleException("Las cuentas son de sucursales distintas.");
        }
        long offset = count("SELECT coalesce(max(position), 0) FROM tab_items WHERE tab_id = :t", Map.of("t", id));
        long moved = em.createNativeQuery("""
                UPDATE tab_items SET tab_id = ?1, position = position + ?3 WHERE tab_id = ?2""")
                .setParameter(1, id).setParameter(2, fromId).setParameter(3, offset).executeUpdate();
        Integer guests = target.guests() == null && from.guests() == null ? null
                : Math.min(99, (target.guests() == null ? 0 : target.guests()) + (from.guests() == null ? 0 : from.guests()));
        em.createNativeQuery("UPDATE tabs SET guests = ?2, version = version + 1 WHERE id = ?1")
                .setParameter(1, id).setParameter(2, guests).executeUpdate();
        em.createNativeQuery("""
                UPDATE tabs SET status = 'MERGED', merged_into = ?2, closed_at = ?3, closed_by = ?4,
                       version = version + 1 WHERE id = ?1""")
                .setParameter(1, fromId).setParameter(2, id).setParameter(3, Instant.now())
                .setParameter(4, CurrentActor.requireUserId()).executeUpdate();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("into", target.label());
        data.put("from", from.label());
        data.put("items", moved);
        audit.log("TAB_MERGED", "tab", id, null, data);
        notifier.tabChanged(target.branchId(), id);
        notifier.tabChanged(from.branchId(), fromId);
        return get(id);
    }

    /** Cancelar con motivo: sin productos, quien atiende; con productos, quien tiene {@code tables:void}. */
    @Transactional
    public TabView cancel(UUID id, String reason) {
        Tab tab = lockOpen(id);
        String why = requireReason(reason);
        long active = count("SELECT count(*) FROM tab_items WHERE tab_id = :t AND voided_at IS NULL", Map.of("t", id));
        if (active > 0 && !CurrentActor.permissions().contains(VOID_PERMISSION)) {
            throw new ForbiddenException("La cuenta tiene productos: pídele a caja o al administrador que la cancele.");
        }
        em.createNativeQuery("""
                UPDATE tabs SET status = 'CANCELLED', cancel_reason = ?2, closed_at = ?3, closed_by = ?4,
                       version = version + 1 WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, why).setParameter(3, Instant.now())
                .setParameter(4, CurrentActor.requireUserId()).executeUpdate();
        audit.log("TAB_CANCELLED", "tab", id, null, Map.of("label", tab.label(), "items", active, "reason", why));
        notifier.tabChanged(tab.branchId(), id);
        return get(id);
    }

    // ------------------------------------------------------------------ cobro

    /**
     * Cobra la cuenta completa: en la misma transacción la vuelve una venta (precio vigente, adiciones, nota; caja e
     * inventario como cualquier venta) y la cierra. Con la misma {@code Idempotency-Key} devuelve la venta ya hecha.
     * Se cobra desde una caja abierta de la sucursal de la cuenta.
     */
    @Transactional
    public UUID charge(UUID id, UUID customerId, List<PaymentLine> payments, BigDecimal expectedTotal,
                       String idempotencyKey) {
        Optional<UUID> done = sales.existingSale(idempotencyKey);
        if (done.isPresent()) {
            return done.get();
        }
        Tab tab = lock(id);
        dining.requireBranch(tab.branchId());
        if ("CHARGED".equals(tab.status())) {
            throw new ConflictException("Esta cuenta ya se cobró.");
        }
        if (!"OPEN".equals(tab.status())) {
            throw new ConflictException("Esta cuenta ya no está abierta.");
        }
        OpenSession session = cash.lockOpenSessionOf(CurrentActor.requireUserId())
                .orElseThrow(() -> new BusinessRuleException("Abre la caja antes de cobrar."));
        if (!session.branchId().equals(tab.branchId())) {
            throw new BusinessRuleException("Esta cuenta es de otra sucursal: cóbrala desde una caja de esa sucursal.");
        }
        Map<UUID, List<ModifierChoices.Choice>> choices = new LinkedHashMap<>();
        for (Object[] m : dining.rows("""
                SELECT m.tab_item_id, m.option_id, m.quantity FROM tab_item_modifiers m
                JOIN tab_items i ON i.id = m.tab_item_id
                WHERE i.tab_id = :t AND i.voided_at IS NULL ORDER BY m.tab_item_id, m.position""", Map.of("t", id))) {
            choices.computeIfAbsent((UUID) m[0], k -> new ArrayList<>())
                    .add(new ModifierChoices.Choice((UUID) m[1], ((Number) m[2]).intValue()));
        }
        List<ItemLine> lines = new ArrayList<>();
        for (Object[] i : dining.rows("""
                SELECT id, product_id, unit_id, quantity, base_price, open_price, note FROM tab_items
                WHERE tab_id = :t AND voided_at IS NULL ORDER BY position""", Map.of("t", id))) {
            boolean openPrice = (Boolean) i[5];
            // El precio que manda es el vigente (decisión del usuario); en precio libre, el que se escribió.
            lines.add(new ItemLine((UUID) i[1], (UUID) i[2], (BigDecimal) i[3], null,
                    openPrice ? (BigDecimal) i[4] : null, choices.getOrDefault((UUID) i[0], List.of()), (String) i[6]));
        }
        if (lines.isEmpty()) {
            throw new BusinessRuleException("La cuenta no tiene productos para cobrar.");
        }
        UUID saleId = sales.createForTab(new SaleCommands.Create(customerId, lines, payments, expectedTotal,
                tab.label()), idempotencyKey);
        em.createNativeQuery("""
                UPDATE tabs SET status = 'CHARGED', sale_id = ?2, closed_at = ?3, closed_by = ?4, version = version + 1
                WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, saleId).setParameter(3, Instant.now())
                .setParameter(4, CurrentActor.requireUserId()).executeUpdate();
        audit.log("TAB_CHARGED", "tab", id, null, Map.of("label", tab.label(), "saleId", saleId, "items", lines.size()));
        notifier.tabChanged(tab.branchId(), id);
        return saleId;
    }

    // ------------------------------------------------------------------ apoyo

    private Tab lockOpen(UUID id) {
        Tab tab = lock(id);
        dining.requireBranch(tab.branchId());
        if (!"OPEN".equals(tab.status())) {
            throw new ConflictException("Esta cuenta ya no está abierta.");
        }
        return tab;
    }

    private Tab lock(UUID id) {
        List<Object[]> found = dining.rows("""
                SELECT t.id, t.number, t.kind, t.table_id, t.status, t.branch_id, t.guests, t.customer_name, dt.name,
                       t.sale_id
                FROM tabs t LEFT JOIN dining_tables dt ON dt.id = t.table_id
                WHERE t.id = :t FOR UPDATE OF t""", Map.of("t", id));
        if (found.isEmpty()) {
            throw new NotFoundException("Cuenta no encontrada.");
        }
        Object[] r = found.getFirst();
        return new Tab((UUID) r[0], ((Number) r[1]).longValue(), (String) r[2], (UUID) r[3], (String) r[4],
                (UUID) r[5], Rows.integer(r[6]), (String) r[7], (String) r[8], (UUID) r[9]);
    }

    /** Bloquea la mesa (activa) y exige que no tenga cuenta abierta: {id, branch_id, name}. */
    private Object[] lockFreeTable(UUID tableId) {
        List<Object[]> found = dining.rows("""
                SELECT id, branch_id, name, active FROM dining_tables WHERE id = :t FOR UPDATE""", Map.of("t", tableId));
        if (found.isEmpty() || !Boolean.TRUE.equals(found.getFirst()[3])) {
            throw new NotFoundException("Mesa no encontrada.");
        }
        Object[] table = found.getFirst();
        dining.requireBranch((UUID) table[1]);
        if (count("SELECT count(*) FROM tabs WHERE table_id = :t AND status = 'OPEN'", Map.of("t", tableId)) > 0) {
            throw new ConflictException("La mesa " + table[2] + " ya tiene una cuenta abierta.");
        }
        return table;
    }

    private void touch(UUID id) {
        em.createNativeQuery("UPDATE tabs SET version = version + 1 WHERE id = ?1").setParameter(1, id).executeUpdate();
    }

    private static String requireReason(String reason) {
        if (reason == null || reason.isBlank()) {
            throw new BusinessRuleException("Escribe el motivo.");
        }
        String why = reason.trim();
        return why.length() > 200 ? why.substring(0, 200) : why;
    }

    private static Details cleanDetails(Details d) {
        if (d.guests() != null && (d.guests() < 1 || d.guests() > 99)) {
            throw new BusinessRuleException("Las personas de la mesa van de 1 a 99.");
        }
        return new Details(d.guests(), trim(d.customerName(), 120), trim(d.phone(), 30), trim(d.address(), 200),
                trim(d.notes(), 200));
    }

    private static String trim(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String clean = value.trim();
        return clean.length() > max ? clean.substring(0, max) : clean;
    }

    private static Map<String, Object> detailsData(Details d) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("guests", d.guests());
        data.put("customerName", d.customerName());
        data.put("phone", d.phone());
        data.put("address", d.address());
        data.put("notes", d.notes());
        return data;
    }

    private long count(String sql, Map<String, Object> params) {
        var query = em.createNativeQuery(sql);
        params.forEach(query::setParameter);
        return ((Number) query.getSingleResult()).longValue();
    }
}
