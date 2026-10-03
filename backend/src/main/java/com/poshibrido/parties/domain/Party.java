package com.poshibrido.parties.domain;

import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.persistence.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/** Tercero (persona natural o jurídica). Puede ser cliente, proveedor o ambos. */
@Getter
@Entity
@Table(name = "parties")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Party extends AuditableEntity {

    @Id
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "person_type", nullable = false)
    private PersonType personType;

    @Enumerated(EnumType.STRING)
    @Column(name = "document_type", nullable = false)
    private DocumentType documentType;

    @Column(name = "document_number", nullable = false)
    private String documentNumber;

    @Column(name = "verification_digit")
    private Integer verificationDigit;

    @Column(name = "first_names")
    private String firstNames;

    @Column(name = "last_names")
    private String lastNames;

    @Column(name = "business_name")
    private String businessName;

    @Column
    private String email;

    @Column
    private String phone;

    @Column
    private String address;

    @Column(name = "city_code")
    private String cityCode;

    /** Tercero del sistema (Consumidor final): no se edita. */
    @Column(name = "system_party", nullable = false, updatable = false)
    private boolean systemParty;

    /** Datos ya validados por el servicio. */
    public record Data(PersonType personType, DocumentType documentType, String documentNumber,
                       Integer verificationDigit, String firstNames, String lastNames, String businessName,
                       String email, String phone, String address, String cityCode) {
    }

    public static Party create(Data data) {
        Party party = new Party();
        party.id = Ids.newId();
        party.systemParty = false;
        party.apply(data);
        return party;
    }

    public void apply(Data data) {
        this.personType = data.personType();
        this.documentType = data.documentType();
        this.documentNumber = data.documentNumber();
        this.verificationDigit = data.verificationDigit();
        this.firstNames = data.firstNames();
        this.lastNames = data.lastNames();
        this.businessName = data.businessName();
        this.email = data.email();
        this.phone = data.phone();
        this.address = data.address();
        this.cityCode = data.cityCode();
    }

    public String displayName() {
        return personType == PersonType.LEGAL ? businessName : (firstNames + " " + lastNames).trim();
    }

    public String formattedDocument() {
        return documentType == DocumentType.NIT && verificationDigit != null
                ? documentNumber + "-" + verificationDigit
                : documentNumber;
    }
}
