package com.poshibrido.shared.api;

import com.poshibrido.shared.error.BusinessRuleException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.Set;

/**
 * Construye un {@link Pageable} a partir de {@code page}, {@code size} y {@code sort=campo,asc|desc},
 * aceptando solo campos de ordenamiento permitidos.
 */
public final class PageRequests {

    public static final int MAX_SIZE = 100;

    private PageRequests() {
    }

    public static Pageable of(int page, int size, String sort, Set<String> allowedFields, Sort defaultSort) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_SIZE);
        if (sort == null || sort.isBlank()) {
            return PageRequest.of(safePage, safeSize, defaultSort);
        }
        String[] parts = sort.split(",");
        String field = parts[0].trim();
        if (!allowedFields.contains(field)) {
            throw new BusinessRuleException("No se puede ordenar por el campo '" + field + "'.");
        }
        Sort.Direction direction = parts.length > 1 && "desc".equalsIgnoreCase(parts[1].trim())
                ? Sort.Direction.DESC
                : Sort.Direction.ASC;
        return PageRequest.of(safePage, safeSize, Sort.by(direction, field));
    }
}
