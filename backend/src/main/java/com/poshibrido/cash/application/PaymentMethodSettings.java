package com.poshibrido.cash.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.cash.application.CashViews.OptionalPaymentMethod;
import com.poshibrido.cash.domain.PaymentMethod;
import com.poshibrido.cash.infrastructure.PaymentMethodRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Medios de pago que el negocio maneja a su gusto: Addi y Sistecrédito llegan apagados (decisión 366) y el negocio
 * agrega los que use (SU+ Pay, Bold, su datáfono…, decisión 367). Ninguno entra al efectivo de la caja. Apagar uno no
 * cambia las ventas que ya lo usaron; solo deja de salir al cobrar.
 */
@Service
@RequiredArgsConstructor
public class PaymentMethodSettings {

    static final int MAX_CUSTOM = 20;

    private final PaymentMethodRepository paymentMethods;
    private final AuditLogger audit;

    @Transactional(readOnly = true)
    public List<OptionalPaymentMethod> optional() {
        return paymentMethods.findAllByOrderBySortOrderAscNameAsc().stream().filter(PaymentMethod::isOptional)
                .map(m -> new OptionalPaymentMethod(m.getId(), m.getCode(), m.getName(), m.isActive(),
                        m.isRequiresReference(), m.isCustom()))
                .toList();
    }

    /** Agrega un medio propio del negocio, ya prendido. */
    @Transactional
    public List<OptionalPaymentMethod> create(String name, boolean requiresReference) {
        String clean = name(name);
        List<PaymentMethod> all = paymentMethods.findAllByOrderBySortOrderAscNameAsc();
        requireUnique(all, clean, null);
        if (all.stream().filter(PaymentMethod::isCustom).count() >= MAX_CUSTOM) {
            throw new BusinessRuleException("Puedes tener hasta " + MAX_CUSTOM + " medios de pago propios. Apaga o "
                    + "renombra uno que ya no uses.");
        }
        int sort = all.stream().mapToInt(PaymentMethod::getSortOrder).filter(o -> o < 90).max().orElse(10) + 1;
        String code = PaymentMethod.CUSTOM_PREFIX
                + HexFormat.of().withUpperCase().formatHex(new byte[]{(byte) ThreadLocalRandom.current().nextInt(),
                (byte) ThreadLocalRandom.current().nextInt(), (byte) ThreadLocalRandom.current().nextInt(),
                (byte) ThreadLocalRandom.current().nextInt()});
        PaymentMethod method = paymentMethods.save(PaymentMethod.custom(Ids.newId(), code, clean, requiresReference,
                Math.min(sort, 89)));
        audit.log("PAYMENT_METHOD_CREATED", "payment_method", method.getId(), null,
                Map.of("name", clean, "requiresReference", requiresReference));
        return optional();
    }

    /** Prende o apaga un medio opcional; a los propios también se les cambia el nombre y si piden referencia. */
    @Transactional
    public List<OptionalPaymentMethod> update(UUID id, Boolean active, String name, Boolean requiresReference) {
        PaymentMethod method = paymentMethods.findById(id)
                .orElseThrow(() -> new NotFoundException("No existe ese medio de pago."));
        if (!method.isOptional()) {
            throw new BusinessRuleException("Este medio de pago no se puede cambiar.");
        }
        Map<String, Object> before = new java.util.LinkedHashMap<>();
        Map<String, Object> after = new java.util.LinkedHashMap<>();
        if (active != null && method.isActive() != active) {
            before.put("active", method.isActive());
            method.setActive(active);
            after.put("active", active);
        }
        if ((name != null || requiresReference != null) && !method.isCustom()) {
            throw new BusinessRuleException("A " + method.getName() + " no se le cambia el nombre ni la referencia.");
        }
        if (name != null) {
            String clean = name(name);
            if (!clean.equals(method.getName())) {
                requireUnique(paymentMethods.findAllByOrderBySortOrderAscNameAsc(), clean, id);
                before.put("name", method.getName());
                method.rename(clean);
                after.put("name", clean);
            }
        }
        if (requiresReference != null && method.isRequiresReference() != requiresReference) {
            before.put("requiresReference", method.isRequiresReference());
            method.setRequiresReference(requiresReference);
            after.put("requiresReference", requiresReference);
        }
        if (!after.isEmpty()) {
            after.putIfAbsent("name", method.getName());
            audit.log("PAYMENT_METHOD_UPDATED", "payment_method", id, before, after);
        }
        return optional();
    }

    private static String name(String name) {
        String clean = name == null ? "" : name.strip().replaceAll("\\s+", " ");
        if (clean.length() < 2 || clean.length() > 40) {
            throw new BusinessRuleException("El nombre del medio de pago va de 2 a 40 letras.");
        }
        return clean;
    }

    private static void requireUnique(List<PaymentMethod> all, String name, UUID except) {
        String key = name.toLowerCase(Locale.ROOT);
        if (all.stream().anyMatch(m -> !m.getId().equals(except) && m.getName().toLowerCase(Locale.ROOT).equals(key))) {
            throw new BusinessRuleException("Ya tienes un medio de pago que se llama " + name + ".");
        }
    }
}
