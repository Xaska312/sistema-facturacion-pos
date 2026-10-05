package com.poshibrido.reporting.application;

import java.util.UUID;

/** Filtros comunes de los reportes de ventas. Nulo = todos. */
public record ReportFilter(ReportPeriod period, UUID branchId, UUID sellerId) {
}
