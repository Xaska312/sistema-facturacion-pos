package com.poshibrido.catalog.infrastructure;

import com.poshibrido.catalog.domain.ProductBarcode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductBarcodeRepository extends JpaRepository<ProductBarcode, UUID> {

    @Query("select b from ProductBarcode b join fetch b.product where b.barcode = :barcode")
    Optional<ProductBarcode> findByBarcode(@Param("barcode") String barcode);

    @Query("select b from ProductBarcode b join fetch b.product where b.barcode in :barcodes")
    List<ProductBarcode> findByBarcodes(@Param("barcodes") Collection<String> barcodes);

    boolean existsByBarcode(String barcode);

    /** Requiere transacción de escritura: nextval no se permite en transacciones de solo lectura. */
    @Transactional
    @Query(value = "SELECT nextval('internal_barcode_seq')", nativeQuery = true)
    long nextInternalSequence();

    default boolean usedByOtherProduct(String barcode, UUID productId) {
        return findByBarcode(barcode).map(b -> !b.getProduct().getId().equals(productId)).orElse(false);
    }
}
