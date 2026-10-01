package com.poshibrido.parties.api;

import com.poshibrido.parties.api.PartyRequests.CustomerRequest;
import com.poshibrido.parties.application.PartyService;
import com.poshibrido.parties.application.PartyView;
import com.poshibrido.shared.api.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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

import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/customers")
public class CustomerController {

    private final PartyService parties;

    /** Orden alfabético (Consumidor final primero). Busca por nombre o número de documento. */
    @GetMapping
    @PreAuthorize("hasAuthority('parties:read')")
    public PageResponse<PartyView> search(@RequestParam(required = false) String search,
                                          @RequestParam(defaultValue = "false") boolean includeInactive,
                                          @RequestParam(defaultValue = "0") int page,
                                          @RequestParam(defaultValue = "20") int size) {
        return PageResponse.of(parties.searchCustomers(search, includeInactive, page, size), v -> v);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('parties:read')")
    public PartyView get(@PathVariable UUID id) {
        return parties.getCustomer(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('parties:manage')")
    public PartyView create(@Valid @RequestBody CustomerRequest request) {
        return parties.createCustomer(request.toCommand(), request.priceListId(), request.creditLimit());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('parties:manage')")
    public PartyView update(@PathVariable UUID id, @Valid @RequestBody CustomerRequest request) {
        return parties.updateCustomer(id, request.toCommand(), request.priceListId(), request.creditLimit());
    }

    @PostMapping("/{id}/activate")
    @PreAuthorize("hasAuthority('parties:manage')")
    public PartyView activate(@PathVariable UUID id) {
        return parties.setCustomerActive(id, true);
    }

    @PostMapping("/{id}/deactivate")
    @PreAuthorize("hasAuthority('parties:manage')")
    public PartyView deactivate(@PathVariable UUID id) {
        return parties.setCustomerActive(id, false);
    }
}
