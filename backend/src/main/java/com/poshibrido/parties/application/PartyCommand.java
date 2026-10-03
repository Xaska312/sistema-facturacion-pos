package com.poshibrido.parties.application;

import com.poshibrido.parties.domain.DocumentType;
import com.poshibrido.parties.domain.PersonType;

/** Datos del tercero tal como llegan del formulario (se validan en {@link PartyService}). */
public record PartyCommand(PersonType personType, DocumentType documentType, String documentNumber,
                           Integer verificationDigit, String firstNames, String lastNames, String businessName,
                           String email, String phone, String address, String cityCode) {
}
