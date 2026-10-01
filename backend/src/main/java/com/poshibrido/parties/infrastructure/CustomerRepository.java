package com.poshibrido.parties.infrastructure;

import com.poshibrido.parties.domain.Customer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface CustomerRepository extends JpaRepository<Customer, UUID> {

    /** Búsqueda por nombre o número de documento; orden alfabético. Usar un Pageable sin orden. */
    @Query(value = """
            select c from Customer c, Party p
            where p.id = c.partyId
              and (lower(coalesce(p.businessName, concat(p.firstNames, ' ', p.lastNames))) like :pattern escape '\\'
                   or p.documentNumber like :documentPattern escape '\\')
              and (:includeInactive = true or c.active = true)
            order by p.systemParty desc, lower(coalesce(p.businessName, concat(p.firstNames, ' ', p.lastNames)))
            """,
            countQuery = """
            select count(c) from Customer c, Party p
            where p.id = c.partyId
              and (lower(coalesce(p.businessName, concat(p.firstNames, ' ', p.lastNames))) like :pattern escape '\\'
                   or p.documentNumber like :documentPattern escape '\\')
              and (:includeInactive = true or c.active = true)
            """)
    Page<Customer> search(@Param("pattern") String pattern, @Param("documentPattern") String documentPattern,
                          @Param("includeInactive") boolean includeInactive, Pageable pageable);
}
