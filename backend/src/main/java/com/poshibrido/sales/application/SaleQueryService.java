package com.poshibrido.sales.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.cash.application.CashApi;
import com.poshibrido.cash.application.CashApi.PaymentMethodRef;
import com.poshibrido.catalog.application.PricingApi;
import com.poshibrido.catalog.application.PricingApi.ResolvedPrice;
import com.poshibrido.organization.application.BranchApi;
import com.poshibrido.organization.application.BranchApi.BranchRef;
import com.poshibrido.organization.application.BusinessSettings;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.organization.application.CashRegisterApi;
import com.poshibrido.organization.application.CashRegisterApi.RegisterRef;
import com.poshibrido.parties.application.CustomerApi;
import com.poshibrido.parties.application.CustomerApi.CustomerRef;
import com.poshibrido.sales.application.SaleViews.ItemView;
import com.poshibrido.sales.application.SaleViews.PaymentView;
import com.poshibrido.sales.application.SaleViews.PosConfig;
import com.poshibrido.sales.application.SaleViews.ReceiptHeader;
import com.poshibrido.sales.application.SaleViews.SaleRow;
import com.poshibrido.sales.application.SaleViews.SaleView;
import com.poshibrido.sales.application.SaleViews.TaxView;
import com.poshibrido.sales.domain.Sale;
import com.poshibrido.sales.domain.SaleStatus;
import com.poshibrido.sales.infrastructure.SaleItemRepository;
import com.poshibrido.sales.infrastructure.SalePaymentRepository;
import com.poshibrido.sales.infrastructure.SaleRepository;
import com.poshibrido.sales.infrastructure.SaleTaxTotalRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.tenancy.application.CurrentTenant;
import com.poshibrido.tenancy.application.TenantApi;
import com.poshibrido.tenancy.application.TenantInfo;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Consultas de ventas: historial, detalle con datos del tiquete, configuración y precios para el POS. */
@Service
@RequiredArgsConstructor
public class SaleQueryService {

    private static final Instant MIN = Instant.parse("2000-01-01T00:00:00Z");
    private static final Instant MAX = Instant.parse("2999-01-01T00:00:00Z");

    private final SaleRepository sales;
    private final SaleItemRepository items;
    private final SalePaymentRepository payments;
    private final SaleTaxTotalRepository taxTotals;
    private final CashApi cash;
    private final BranchApi branches;
    private final CashRegisterApi registers;
    private final MemberDirectory memberDirectory;
    private final BusinessSettingsApi settings;
    private final TenantApi tenants;
    private final PricingApi pricing;
    private final CustomerApi customers;

    @Transactional(readOnly = true)
    public PosConfig posConfig() {
        BusinessSettings cfg = settings.current();
        return new PosConfig(cfg.pricesIncludeTax(), cfg.maxDiscountPercent(), cfg.allowNegativeStock(),
                cfg.currency(), cfg.receiptFooter(), businessName(), CustomerApi.FINAL_CONSUMER_ID);
    }

    /** Precio vigente de un producto en una unidad para el cliente indicado (consumidor final si es nulo). */
    @Transactional(readOnly = true)
    public ResolvedPrice price(UUID productId, UUID unitId, UUID customerId) {
        CustomerRef customer = customers.find(customerId == null ? CustomerApi.FINAL_CONSUMER_ID : customerId)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado."));
        return pricing.price(productId, unitId, customer.priceListId());
    }

    /**
     * Historial de ventas, más recientes primero. Fechas en la zona horaria del negocio; {@code search} es un
     * número de tiquete o parte del nombre o documento del cliente.
     */
    @Transactional(readOnly = true)
    public Page<SaleRow> search(LocalDate from, LocalDate to, UUID branchId, SaleStatus status, UUID cashSessionId,
                                String search, int page, int size) {
        ZoneId zone = ZoneId.of(settings.current().timezone());
        Instant start = from == null ? MIN : from.atStartOfDay(zone).toInstant();
        Instant end = to == null ? MAX : to.plusDays(1).atStartOfDay(zone).toInstant();
        String term = search == null ? "" : search.trim();
        Long number = parseNumber(term);
        boolean anyText = term.isEmpty() || number != null;
        String escaped = escapeLike(term.toLowerCase(Locale.ROOT));
        UUID none = new UUID(0, 0);
        Page<Sale> result = sales.search(start, end, branchId == null, branchId == null ? none : branchId,
                status == null, status == null ? SaleStatus.COMPLETED : status,
                cashSessionId == null, cashSessionId == null ? none : cashSessionId,
                number == null, number == null ? 0L : number,
                anyText, "%" + escaped + "%", escaped + "%",
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)));
        Map<UUID, BranchRef> branchById = branchMap(result.getContent().stream().map(Sale::getBranchId).toList());
        Map<UUID, RegisterRef> registerById = registerMap();
        Map<UUID, String> names = memberDirectory.displayNames(
                result.getContent().stream().map(Sale::getCreatedBy).collect(Collectors.toSet()));
        return result.map(s -> {
            BranchRef branch = branchById.get(s.getBranchId());
            RegisterRef register = registerById.get(s.getCashRegisterId());
            return new SaleRow(s.getId(), s.documentNumber(), s.getNumber(), s.getStatus(), s.getCreatedAt(),
                    s.getBranchId(), branch == null ? null : branch.name(), s.getCashRegisterId(),
                    register == null ? null : register.code(), s.getCustomerName(), document(s), s.getTotal(),
                    s.getItemCount(), s.getCreatedBy(), names.get(s.getCreatedBy()));
        });
    }

    @Transactional(readOnly = true)
    public SaleView sale(UUID id) {
        Sale s = sales.findById(id).orElseThrow(() -> new NotFoundException("Venta no encontrada."));
        Map<UUID, PaymentMethodRef> methods = cash.paymentMethods();
        Set<UUID> people = new HashSet<>();
        people.add(s.getCreatedBy());
        if (s.getVoidedBy() != null) {
            people.add(s.getVoidedBy());
        }
        Map<UUID, String> names = memberDirectory.displayNames(people);
        List<ItemView> itemViews = items.findBySaleIdOrderByLineNoAsc(id).stream()
                .map(i -> new ItemView(i.getLineNo(), i.getProductId(), i.getSku(), i.getName(), i.getUnitId(),
                        i.getUnitCode(), i.getQuantity(), i.getUnitPrice(), i.getGrossAmount(), i.getDiscountPercent(),
                        i.getDiscountAmount(), i.getTaxType(), i.getTaxRate(), i.getTaxableBase(), i.getTaxAmount(),
                        i.getTotal()))
                .toList();
        List<PaymentView> paymentViews = payments.findBySaleIdOrderByLineNoAsc(id).stream()
                .map(p -> {
                    PaymentMethodRef m = methods.get(p.getPaymentMethodId());
                    return new PaymentView(p.getLineNo(), p.getPaymentMethodId(), p.getMethodCode(),
                            m == null ? p.getMethodCode() : m.name(), p.getAmount(), p.getTendered(), p.getReference());
                })
                .toList();
        List<TaxView> taxViews = taxTotals.findBySale(id).stream()
                .map(t -> new TaxView(t.getId().getTaxId(), t.getTaxType(), t.getTaxRate(), t.getTaxableBase(),
                        t.getTaxAmount()))
                .toList();
        BusinessSettings cfg = settings.current();
        BranchRef branch = branchMap(List.of(s.getBranchId())).get(s.getBranchId());
        RegisterRef register = registers.find(s.getCashRegisterId()).orElse(null);
        ReceiptHeader receipt = new ReceiptHeader(businessName(), branch == null ? null : branch.name(),
                branch == null ? null : branch.address(), branch == null ? null : branch.phone(),
                register == null ? null : register.code(), register == null ? null : register.name(),
                cfg.receiptFooter(), cfg.timezone());
        return new SaleView(s.getId(), s.documentNumber(), s.getPrefix(), s.getNumber(), s.getStatus(),
                s.getCreatedAt(), s.getBranchId(), s.getCashRegisterId(), s.getCashSessionId(), s.getCustomerId(),
                s.getCustomerDocumentType(), s.getCustomerDocumentNumber(), s.getCustomerVerificationDigit(),
                s.getCustomerName(), s.isPricesIncludeTax(), s.getGrossTotal(), s.getDiscountTotal(), s.getSubtotal(),
                s.getTaxTotal(), s.getTotal(), s.getPaidTotal(), s.getChangeAmount(), s.getNotes(), s.getCreatedBy(),
                names.get(s.getCreatedBy()), s.getVoidedAt(), s.getVoidedBy(),
                s.getVoidedBy() == null ? null : names.get(s.getVoidedBy()), s.getVoidReason(), itemViews,
                paymentViews, taxViews, receipt);
    }

    private String businessName() {
        return tenants.findInfo(CurrentTenant.require().id()).map(TenantInfo::tradeName).orElse("");
    }

    private Map<UUID, BranchRef> branchMap(List<UUID> ids) {
        return branches.findByIds(ids.stream().filter(Objects::nonNull).distinct().toList()).stream()
                .collect(Collectors.toMap(BranchRef::id, Function.identity()));
    }

    private Map<UUID, RegisterRef> registerMap() {
        return registers.all().stream().collect(Collectors.toMap(RegisterRef::id, Function.identity()));
    }

    private static String document(Sale s) {
        return s.getCustomerVerificationDigit() == null
                ? s.getCustomerDocumentNumber()
                : s.getCustomerDocumentNumber() + "-" + s.getCustomerVerificationDigit();
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /** "POS-12", "pos 12" o "12" → 12; otro texto → nulo. */
    private static Long parseNumber(String term) {
        String digits = term.replaceFirst("(?i)^[a-z]{1,10}[-\\s]?", "");
        if (digits.isEmpty() || !digits.chars().allMatch(Character::isDigit) || digits.length() > 15) {
            return null;
        }
        try {
            return Long.parseLong(digits);
        } catch (NumberFormatException ex) {
            throw new BusinessRuleException("Número de tiquete inválido.");
        }
    }
}
