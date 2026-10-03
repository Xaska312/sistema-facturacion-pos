package com.poshibrido.sales.application;

import com.poshibrido.cash.application.CashApi;
import com.poshibrido.cash.application.CashApi.PaymentMethodRef;
import com.poshibrido.cash.application.SessionSalesSummary;
import com.poshibrido.sales.domain.SaleStatus;
import com.poshibrido.sales.infrastructure.SalePaymentRepository;
import com.poshibrido.sales.infrastructure.SaleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Ventas de una sesión de caja para el informe de cierre. */
@Component
@RequiredArgsConstructor
public class SalesSessionSummary implements SessionSalesSummary {

    private final SaleRepository sales;
    private final SalePaymentRepository payments;
    private final CashApi cash;

    @Override
    @Transactional(readOnly = true)
    public Summary summarize(UUID cashSessionId) {
        Object[] all = sales.totalsBySession(cashSessionId, true, SaleStatus.COMPLETED).getFirst();
        Object[] voided = sales.totalsBySession(cashSessionId, false, SaleStatus.VOIDED).getFirst();
        Map<UUID, PaymentMethodRef> methods = cash.paymentMethods();
        List<MethodTotal> byMethod = new ArrayList<>();
        for (Object[] row : payments.totalsByMethod(cashSessionId)) {
            UUID methodId = (UUID) row[0];
            PaymentMethodRef method = methods.get(methodId);
            byMethod.add(new MethodTotal(methodId, method == null ? null : method.code(),
                    method == null ? null : method.name(), decimal(row[1]), ((Number) row[2]).longValue()));
        }
        byMethod.sort(Comparator.comparing(MethodTotal::amount).reversed());
        return new Summary(((Number) all[0]).longValue(), decimal(all[1]), ((Number) voided[0]).longValue(),
                decimal(voided[1]), byMethod, sales.countByVoidCashSessionId(cashSessionId));
    }

    private static BigDecimal decimal(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        return value instanceof BigDecimal d ? d : new BigDecimal(value.toString());
    }
}
