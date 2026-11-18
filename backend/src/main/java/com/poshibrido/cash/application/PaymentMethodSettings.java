package com.poshibrido.cash.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.cash.application.CashViews.OptionalPaymentMethod;
import com.poshibrido.cash.domain.PaymentMethod;
import com.poshibrido.cash.infrastructure.PaymentMethodRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Medios de pago opcionales (decisión 366): Addi y Sistecrédito llegan apagados y cada negocio los prende si es aliado.
 * Apagar uno no cambia las ventas que ya lo usaron; solo deja de salir al cobrar.
 */
@Service
@RequiredArgsConstructor
public class PaymentMethodSettings {

    private final PaymentMethodRepository paymentMethods;
    private final AuditLogger audit;

    @Transactional(readOnly = true)
    public List<OptionalPaymentMethod> optional() {
        return paymentMethods.findAllByOrderBySortOrderAscNameAsc().stream().filter(PaymentMethod::isOptional)
                .map(m -> new OptionalPaymentMethod(m.getId(), m.getCode(), m.getName(), m.isActive())).toList();
    }

    @Transactional
    public List<OptionalPaymentMethod> setActive(UUID id, boolean active) {
        PaymentMethod method = paymentMethods.findById(id)
                .orElseThrow(() -> new NotFoundException("No existe ese medio de pago."));
        if (!method.isOptional()) {
            throw new BusinessRuleException("Este medio de pago no se puede apagar.");
        }
        if (method.isActive() != active) {
            method.setActive(active);
            audit.log("PAYMENT_METHOD_UPDATED", "payment_method", id, Map.of("active", !active),
                    Map.of("active", active, "name", method.getName()));
        }
        return optional();
    }
}
