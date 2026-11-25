package com.poshibrido.organization.api;

import com.poshibrido.catalog.application.BranchSaleCategories;
import com.poshibrido.catalog.application.BranchSaleCategories.SaleCategories;
import com.poshibrido.organization.application.BranchService;
import com.poshibrido.organization.application.BranchSetupService;
import com.poshibrido.organization.application.BranchService.BranchData;
import com.poshibrido.shared.api.PageRequests;
import com.poshibrido.shared.api.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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

import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/branches")
public class BranchController {

    private static final Set<String> SORTABLE = Set.of("code", "name", "createdAt");

    private final BranchService branchService;
    private final BranchSetupService setupService;
    private final BranchSaleCategories saleCategories;

    /** Asistente de nueva sucursal (decisión 378). */
    public record SetupRequest(
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{2,20}$", message = "Solo letras, números, '_' o '-' (2 a 20)")
            String code,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 255) String address,
            @Pattern(regexp = "^\\d{5}$", message = "Código DIVIPOLA de 5 dígitos") String cityCode,
            @Size(max = 30) String phone,
            @Size(max = 120) String registerName,
            @Size(max = 40) String zoneName,
            @Min(0) @Max(60) int tables,
            @Size(max = 200) List<@NotNull UUID> menuCategoryIds,
            boolean sellsAll,
            @Size(max = 200) List<@NotNull UUID> saleCategoryIds) {
    }

    public record SetupResponse(BranchResponse branch, UUID cashRegisterId, UUID zoneId, int tables, UUID menuId,
                                List<String> notes) {
    }

    public record SaleCategoriesRequest(boolean sellsAll, @Size(max = 200) List<@NotNull UUID> categoryIds) {
    }

    @GetMapping
    @PreAuthorize("hasAuthority('branches:read')")
    public PageResponse<BranchResponse> list(@RequestParam(defaultValue = "0") int page,
                                             @RequestParam(defaultValue = "20") int size,
                                             @RequestParam(required = false) String sort) {
        return PageResponse.of(
                branchService.list(PageRequests.of(page, size, sort, SORTABLE, Sort.by("code"))),
                BranchResponse::of);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('branches:read')")
    public BranchResponse get(@PathVariable UUID id) {
        return BranchResponse.of(branchService.get(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('branches:manage')")
    public BranchResponse create(@Valid @RequestBody CreateBranchRequest request) {
        return BranchResponse.of(branchService.create(request.code(),
                new BranchData(request.name(), request.address(), request.cityCode(), request.phone())));
    }

    @PostMapping("/setup")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('branches:manage')")
    public SetupResponse setup(@Valid @RequestBody SetupRequest r) {
        BranchSetupService.SetupResult result = setupService.setup(new BranchSetupService.SetupInput(r.code(),
                new BranchData(r.name(), r.address(), r.cityCode(), r.phone()), r.registerName(), r.zoneName(),
                r.tables(), r.menuCategoryIds(), r.sellsAll(), r.saleCategoryIds()));
        return new SetupResponse(BranchResponse.of(result.branch()), result.cashRegisterId(), result.zoneId(),
                result.tables(), result.menuId(), result.notes());
    }

    /** Qué vende la sucursal (decisión 378). Lo lee Vender y Mesas, por eso basta con poder ver productos. */
    @GetMapping("/{id}/sale-categories")
    @PreAuthorize("hasAuthority('products:read')")
    public SaleCategories saleCategories(@PathVariable UUID id) {
        return saleCategories.get(id);
    }

    @PutMapping("/{id}/sale-categories")
    @PreAuthorize("hasAuthority('branches:manage')")
    public SaleCategories setSaleCategories(@PathVariable UUID id, @Valid @RequestBody SaleCategoriesRequest r) {
        return saleCategories.set(id, r.sellsAll(), r.categoryIds());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('branches:manage')")
    public BranchResponse update(@PathVariable UUID id, @Valid @RequestBody BranchRequest request) {
        return BranchResponse.of(branchService.update(id,
                new BranchData(request.name(), request.address(), request.cityCode(), request.phone())));
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize("hasAuthority('branches:manage')")
    public BranchResponse deactivate(@PathVariable UUID id) {
        return BranchResponse.of(branchService.deactivate(id));
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize("hasAuthority('branches:manage')")
    public BranchResponse activate(@PathVariable UUID id) {
        return BranchResponse.of(branchService.activate(id));
    }
}
