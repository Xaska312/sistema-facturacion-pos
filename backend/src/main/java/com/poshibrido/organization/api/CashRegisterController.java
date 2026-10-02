package com.poshibrido.organization.api;

import com.poshibrido.organization.application.CashRegisterService;
import com.poshibrido.organization.domain.CashRegister;
import com.poshibrido.shared.api.PageRequests;
import com.poshibrido.shared.api.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/cash-registers")
public class CashRegisterController {

    private static final Set<String> SORTABLE = Set.of("code", "name", "createdAt");

    private final CashRegisterService service;

    public record CashRegisterResponse(UUID id, UUID branchId, String code, String name, boolean active) {
        static CashRegisterResponse of(CashRegister r) {
            return new CashRegisterResponse(r.getId(), r.getBranchId(), r.getCode(), r.getName(), r.isActive());
        }
    }

    public record CreateCashRegisterRequest(
            @NotNull UUID branchId,
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{2,20}$", message = "Solo letras, números, '_' o '-' (2 a 20)")
            String code,
            @NotBlank @Size(max = 120) String name) {
    }

    public record UpdateCashRegisterRequest(@NotBlank @Size(max = 120) String name) {
    }

    @GetMapping
    @PreAuthorize("hasAuthority('branches:read')")
    public PageResponse<CashRegisterResponse> list(@RequestParam(required = false) UUID branchId,
                                                   @RequestParam(defaultValue = "0") int page,
                                                   @RequestParam(defaultValue = "20") int size,
                                                   @RequestParam(required = false) String sort) {
        return PageResponse.of(service.list(branchId,
                PageRequests.of(page, size, sort, SORTABLE, Sort.by("code"))), CashRegisterResponse::of);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('branches:read')")
    public CashRegisterResponse get(@PathVariable UUID id) {
        return CashRegisterResponse.of(service.get(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('cash-registers:manage')")
    public CashRegisterResponse create(@Valid @RequestBody CreateCashRegisterRequest request) {
        return CashRegisterResponse.of(service.create(request.branchId(), request.code(), request.name()));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('cash-registers:manage')")
    public CashRegisterResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateCashRegisterRequest request) {
        return CashRegisterResponse.of(service.rename(id, request.name()));
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize("hasAuthority('cash-registers:manage')")
    public CashRegisterResponse deactivate(@PathVariable UUID id) {
        return CashRegisterResponse.of(service.setActive(id, false));
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize("hasAuthority('cash-registers:manage')")
    public CashRegisterResponse activate(@PathVariable UUID id) {
        return CashRegisterResponse.of(service.setActive(id, true));
    }
}
