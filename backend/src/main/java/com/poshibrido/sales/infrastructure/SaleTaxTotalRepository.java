package com.poshibrido.sales.infrastructure;

import com.poshibrido.sales.domain.SaleTaxTotal;
import com.poshibrido.sales.domain.SaleTaxTotalId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface SaleTaxTotalRepository extends JpaRepository<SaleTaxTotal, SaleTaxTotalId> {

    @Query("select t from SaleTaxTotal t where t.id.saleId = :saleId order by t.taxRate desc")
    List<SaleTaxTotal> findBySale(@Param("saleId") UUID saleId);
}
