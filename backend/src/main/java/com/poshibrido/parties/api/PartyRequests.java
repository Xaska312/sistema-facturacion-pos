package com.poshibrido.parties.api;

import com.poshibrido.parties.application.PartyCommand;
import com.poshibrido.parties.domain.DocumentType;
import com.poshibrido.parties.domain.PersonType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

/** Cuerpos de petición de clientes y proveedores. */
public final class PartyRequests {

    private PartyRequests() {
    }

    public record SupplierRequest(
            @NotNull PersonType personType,
            @NotNull DocumentType documentType,
            @NotBlank @Size(max = 20) String documentNumber,
            @Min(0) @Max(9) Integer verificationDigit,
            @Size(max = 100) String firstNames,
            @Size(max = 100) String lastNames,
            @Size(max = 200) String businessName,
            @Size(max = 255) String email,
            @Size(max = 30) String phone,
            @Size(max = 255) String address,
            @Pattern(regexp = "^\\d{5}$", message = "Código DIVIPOLA de 5 dígitos") String cityCode) {

        PartyCommand toCommand() {
            return new PartyCommand(personType, documentType, documentNumber, verificationDigit, firstNames, lastNames,
                    businessName, email, phone, address, cityCode);
        }
    }

    public record CustomerRequest(
            @NotNull PersonType personType,
            @NotNull DocumentType documentType,
            @NotBlank @Size(max = 20) String documentNumber,
            @Min(0) @Max(9) Integer verificationDigit,
            @Size(max = 100) String firstNames,
            @Size(max = 100) String lastNames,
            @Size(max = 200) String businessName,
            @Size(max = 255) String email,
            @Size(max = 30) String phone,
            @Size(max = 255) String address,
            @Pattern(regexp = "^\\d{5}$", message = "Código DIVIPOLA de 5 dígitos") String cityCode,
            UUID priceListId,
            @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal creditLimit) {

        PartyCommand toCommand() {
            return new PartyCommand(personType, documentType, documentNumber, verificationDigit, firstNames, lastNames,
                    businessName, email, phone, address, cityCode);
        }
    }
}
