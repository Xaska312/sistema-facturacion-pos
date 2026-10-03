package com.poshibrido.parties.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.application.PriceListApi;
import com.poshibrido.catalog.application.PriceListApi.PriceListRef;
import com.poshibrido.location.application.LocationApi;
import com.poshibrido.parties.domain.Customer;
import com.poshibrido.parties.domain.DocumentType;
import com.poshibrido.parties.domain.Nit;
import com.poshibrido.parties.domain.Party;
import com.poshibrido.parties.domain.PersonType;
import com.poshibrido.parties.domain.Supplier;
import com.poshibrido.parties.infrastructure.CustomerRepository;
import com.poshibrido.parties.infrastructure.PartyRepository;
import com.poshibrido.parties.infrastructure.SupplierRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Terceros en sus roles de cliente y proveedor. Un mismo documento es un solo tercero: si ya existe
 * como proveedor y se registra como cliente (o al revés), se reutiliza y se actualizan sus datos.
 */
@Service
@RequiredArgsConstructor
public class PartyService {

    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    private final PartyRepository parties;
    private final CustomerRepository customers;
    private final SupplierRepository suppliers;
    private final PriceListApi priceLists;
    private final LocationApi locations;
    private final AuditLogger audit;

    // ------------------------------------------------------------------ Clientes

    @Transactional(readOnly = true)
    public Page<PartyView> searchCustomers(String search, boolean includeInactive, int page, int size) {
        Page<Customer> result = customers.search(namePattern(search), documentPattern(search), includeInactive,
                pageRequest(page, size));
        Map<UUID, Party> partyById = partiesOf(result.getContent().stream().map(Customer::getPartyId).toList());
        Map<UUID, PriceListRef> lists = priceLists.all();
        return result.map(c -> customerView(partyById.get(c.getPartyId()), c, lists));
    }

    @Transactional(readOnly = true)
    public PartyView getCustomer(UUID id) {
        Customer customer = customer(id);
        return customerView(party(id), customer, priceLists.all());
    }

    @Transactional
    public PartyView createCustomer(PartyCommand command, UUID priceListId, BigDecimal creditLimit) {
        Party.Data data = validate(command);
        UUID listId = validPriceList(priceListId);
        Party party = findOrCreate(data, true);
        if (customers.existsById(party.getId())) {
            throw new ConflictException("Ya existe un cliente con el documento " + party.formattedDocument() + ".");
        }
        Customer customer = customers.save(Customer.of(party.getId(), listId, creditLimit));
        audit.log("CUSTOMER_CREATED", "customer", party.getId(), null, snapshot(party, customer));
        return customerView(party, customer, priceLists.all());
    }

    @Transactional
    public PartyView updateCustomer(UUID id, PartyCommand command, UUID priceListId, BigDecimal creditLimit) {
        Customer customer = customer(id);
        Party party = editableParty(id);
        Party.Data data = validate(command);
        requireDocumentFree(data, id);
        Map<String, Object> before = snapshot(party, customer);
        party.apply(data);
        customer.update(validPriceList(priceListId), creditLimit);
        audit.log("CUSTOMER_UPDATED", "customer", id, before, snapshot(party, customer));
        return customerView(party, customer, priceLists.all());
    }

    @Transactional
    public PartyView setCustomerActive(UUID id, boolean active) {
        Customer customer = customer(id);
        Party party = editableParty(id);
        customer.setActive(active);
        audit.log(active ? "CUSTOMER_ACTIVATED" : "CUSTOMER_DEACTIVATED", "customer", id, null, null);
        return customerView(party, customer, priceLists.all());
    }

    // ------------------------------------------------------------------ Proveedores

    @Transactional(readOnly = true)
    public Page<PartyView> searchSuppliers(String search, boolean includeInactive, int page, int size) {
        Page<Supplier> result = suppliers.search(namePattern(search), documentPattern(search), includeInactive,
                pageRequest(page, size));
        Map<UUID, Party> partyById = partiesOf(result.getContent().stream().map(Supplier::getPartyId).toList());
        return result.map(s -> supplierView(partyById.get(s.getPartyId()), s));
    }

    @Transactional(readOnly = true)
    public PartyView getSupplier(UUID id) {
        return supplierView(party(id), supplier(id));
    }

    @Transactional
    public PartyView createSupplier(PartyCommand command) {
        Party.Data data = validate(command);
        Party party = findOrCreate(data, false);
        if (suppliers.existsById(party.getId())) {
            throw new ConflictException("Ya existe un proveedor con el documento " + party.formattedDocument() + ".");
        }
        Supplier supplier = suppliers.save(Supplier.of(party.getId()));
        audit.log("SUPPLIER_CREATED", "supplier", party.getId(), null, snapshot(party, null));
        return supplierView(party, supplier);
    }

    @Transactional
    public PartyView updateSupplier(UUID id, PartyCommand command) {
        Supplier supplier = supplier(id);
        Party party = editableParty(id);
        Party.Data data = validate(command);
        requireDocumentFree(data, id);
        Map<String, Object> before = snapshot(party, null);
        party.apply(data);
        audit.log("SUPPLIER_UPDATED", "supplier", id, before, snapshot(party, null));
        return supplierView(party, supplier);
    }

    @Transactional
    public PartyView setSupplierActive(UUID id, boolean active) {
        Supplier supplier = supplier(id);
        Party party = editableParty(id);
        supplier.setActive(active);
        audit.log(active ? "SUPPLIER_ACTIVATED" : "SUPPLIER_DEACTIVATED", "supplier", id, null, null);
        return supplierView(party, supplier);
    }

    // ------------------------------------------------------------------ Validación

    /** Valida y normaliza los datos del tercero (formato del documento, DV del NIT, nombres, ciudad). */
    Party.Data validate(PartyCommand c) {
        if (c.personType() == null || c.documentType() == null) {
            throw new BusinessRuleException("Indica el tipo de persona y el tipo de documento.");
        }
        String number = c.documentNumber() == null ? "" : c.documentNumber().replaceAll("[\\s.\\-]", "").toUpperCase(Locale.ROOT);
        if (!c.documentType().accepts(number)) {
            throw new BusinessRuleException("El número no tiene un formato válido para " + c.documentType().label() + ".");
        }
        Integer dv = null;
        if (c.documentType() == DocumentType.NIT) {
            int expected = Nit.verificationDigit(number);
            if (c.verificationDigit() == null) {
                throw new BusinessRuleException("El NIT requiere dígito de verificación.");
            }
            if (c.verificationDigit() != expected) {
                throw new BusinessRuleException("El dígito de verificación no corresponde al NIT " + number
                        + " (debería ser " + expected + ").");
            }
            dv = expected;
        }
        if (c.personType() == PersonType.LEGAL && c.documentType() != DocumentType.NIT) {
            throw new BusinessRuleException("Una persona jurídica se identifica con NIT.");
        }
        String firstNames = blankToNull(c.firstNames());
        String lastNames = blankToNull(c.lastNames());
        String businessName = blankToNull(c.businessName());
        if (c.personType() == PersonType.NATURAL) {
            if (firstNames == null || lastNames == null) {
                throw new BusinessRuleException("Indica nombres y apellidos.");
            }
            businessName = null;
        } else {
            if (businessName == null) {
                throw new BusinessRuleException("Indica la razón social.");
            }
            firstNames = null;
            lastNames = null;
        }
        String email = blankToNull(c.email());
        if (email != null) {
            email = email.toLowerCase(Locale.ROOT);
            if (!EMAIL.matcher(email).matches()) {
                throw new BusinessRuleException("El correo no es válido.");
            }
        }
        String cityCode = blankToNull(c.cityCode());
        if (cityCode != null && locations.findCity(cityCode).isEmpty()) {
            throw new BusinessRuleException("El municipio " + cityCode + " no existe en el catálogo DIVIPOLA.");
        }
        return new Party.Data(c.personType(), c.documentType(), number, dv, firstNames, lastNames, businessName,
                email, blankToNull(c.phone()), blankToNull(c.address()), cityCode);
    }

    private Party findOrCreate(Party.Data data, boolean asCustomer) {
        Optional<Party> existing = parties.findByDocumentTypeAndDocumentNumber(data.documentType(), data.documentNumber());
        if (existing.isEmpty()) {
            return parties.save(Party.create(data));
        }
        Party party = existing.get();
        if (party.isSystemParty()) {
            throw new ConflictException("Ese documento pertenece al tercero del sistema " + party.displayName() + ".");
        }
        boolean alreadyInRole = asCustomer ? customers.existsById(party.getId()) : suppliers.existsById(party.getId());
        if (!alreadyInRole) {
            party.apply(data);
        }
        return party;
    }

    private void requireDocumentFree(Party.Data data, UUID selfId) {
        parties.findByDocumentTypeAndDocumentNumber(data.documentType(), data.documentNumber())
                .filter(other -> !other.getId().equals(selfId))
                .ifPresent(other -> {
                    throw new ConflictException("Ya existe otro tercero con el documento " + other.formattedDocument() + ".");
                });
    }

    private UUID validPriceList(UUID priceListId) {
        if (priceListId == null) {
            return null;
        }
        PriceListRef list = priceLists.find(priceListId)
                .orElseThrow(() -> new BusinessRuleException("La lista de precios no existe."));
        if (!list.active()) {
            throw new BusinessRuleException("La lista de precios está inactiva.");
        }
        return list.defaultList() ? null : list.id();
    }

    // ------------------------------------------------------------------ Lectura y vistas

    private Customer customer(UUID id) {
        return customers.findById(id).orElseThrow(() -> new NotFoundException("Cliente no encontrado."));
    }

    private Supplier supplier(UUID id) {
        return suppliers.findById(id).orElseThrow(() -> new NotFoundException("Proveedor no encontrado."));
    }

    private Party party(UUID id) {
        return parties.findById(id).orElseThrow(() -> new NotFoundException("Tercero no encontrado."));
    }

    private Party editableParty(UUID id) {
        Party party = party(id);
        if (party.isSystemParty()) {
            throw new BusinessRuleException("El tercero " + party.displayName() + " es del sistema y no se puede modificar.");
        }
        return party;
    }

    private Map<UUID, Party> partiesOf(List<UUID> ids) {
        return parties.findAllById(ids).stream().collect(Collectors.toMap(Party::getId, Function.identity()));
    }

    private PartyView customerView(Party p, Customer c, Map<UUID, PriceListRef> lists) {
        PriceListRef list = c.getPriceListId() == null ? null : lists.get(c.getPriceListId());
        return view(p, c.isActive(), c.getPriceListId(), list == null ? "General" : list.name(), c.getCreditLimit(),
                true, suppliers.existsById(p.getId()));
    }

    private PartyView supplierView(Party p, Supplier s) {
        return view(p, s.isActive(), null, null, null, customers.existsById(p.getId()), true);
    }

    private static PartyView view(Party p, boolean active, UUID priceListId, String priceListName,
                                  BigDecimal creditLimit, boolean customer, boolean supplier) {
        return new PartyView(p.getId(), p.getPersonType(), p.getDocumentType(), p.getDocumentNumber(),
                p.getVerificationDigit(), p.formattedDocument(), p.displayName(), p.getFirstNames(), p.getLastNames(),
                p.getBusinessName(), p.getEmail(), p.getPhone(), p.getAddress(), p.getCityCode(), active,
                p.isSystemParty(), priceListId, priceListName, creditLimit, customer, supplier);
    }

    private static Map<String, Object> snapshot(Party p, Customer c) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("document", p.getDocumentType() + " " + p.formattedDocument());
        data.put("name", p.displayName());
        data.put("email", p.getEmail());
        data.put("phone", p.getPhone());
        data.put("cityCode", p.getCityCode());
        if (c != null) {
            data.put("priceListId", c.getPriceListId());
            data.put("creditLimit", c.getCreditLimit());
        }
        return data;
    }

    private static PageRequest pageRequest(int page, int size) {
        return PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
    }

    private static String namePattern(String search) {
        String term = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
        return "%" + escapeLike(term) + "%";
    }

    private static String documentPattern(String search) {
        String term = search == null ? "" : search.replaceAll("[\\s.\\-]", "");
        return "%" + escapeLike(term) + "%";
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
