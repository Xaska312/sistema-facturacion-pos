package com.poshibrido.organization.api;

import com.poshibrido.organization.application.BranchService;
import com.poshibrido.organization.application.BranchService.BranchData;
import com.poshibrido.shared.api.PageRequests;
import com.poshibrido.shared.api.PageResponse;
import jakarta.validation.Valid;
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
@RequestMapping("/api/v1/branches")
public class BranchController {

    private static final Set<String> SORTABLE = Set.of("code", "name", "createdAt");

    private final BranchService branchService;

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
