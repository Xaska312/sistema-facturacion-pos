package com.poshibrido.parties.infrastructure;

import com.poshibrido.parties.domain.Supplier;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface SupplierRepository extends JpaRepository<Supplier, UUID> {

    /** Búsqueda por nombre o número de documento; orden alfabético. Usar un Pageable sin orden. */
    @Query(value = """
            select s from Supplier s, Party p
            where p.id = s.partyId
              and (lower(coalesce(p.businessName, concat(p.firstNames, ' ', p.lastNames))) like :pattern escape '\\'
                   or p.documentNumber like :documentPattern escape '\\')
              and (:includeInactive = true or s.active = true)
            order by lower(coalesce(p.businessName, concat(p.firstNames, ' ', p.lastNames)))
            """,
            countQuery = """
            select count(s) from Supplier s, Party p
            where p.id = s.partyId
              and (lower(coalesce(p.businessName, concat(p.firstNames, ' ', p.lastNames))) like :pattern escape '\\'
                   or p.documentNumber like :documentPattern escape '\\')
              and (:includeInactive = true or s.active = true)
            """)
    Page<Supplier> search(@Param("pattern") String pattern, @Param("documentPattern") String documentPattern,
                          @Param("includeInactive") boolean includeInactive, Pageable pageable);
}
