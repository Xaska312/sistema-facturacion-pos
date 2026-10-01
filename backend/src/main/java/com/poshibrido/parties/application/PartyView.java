package com.poshibrido.parties.application;

import com.poshibrido.parties.domain.DocumentType;
import com.poshibrido.parties.domain.PersonType;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Tercero en su rol de cliente o proveedor. {@code priceListId}/{@code creditLimit} solo aplican a clientes;
 * {@code alsoCustomer}/{@code alsoSupplier} indican si tiene el otro rol.
 */
public record PartyView(UUID id, PersonType personType, DocumentType documentType, String documentNumber,
                        Integer verificationDigit, String formattedDocument, String displayName, String firstNames,
                        String lastNames, String businessName, String email, String phone, String address,
                        String cityCode, boolean active, boolean system, UUID priceListId, String priceListName,
                        BigDecimal creditLimit, boolean alsoCustomer, boolean alsoSupplier) {
}
