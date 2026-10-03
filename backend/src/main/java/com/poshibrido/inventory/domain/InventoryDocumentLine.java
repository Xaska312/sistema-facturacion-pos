package com.poshibrido.inventory.domain;

import com.poshibrido.shared.id.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Línea de un documento: cantidad en la unidad elegida, factor y cantidad en unidad base.
 * En conteos guarda lo esperado y lo contado; en ajustes, la dirección (IN/OUT).
 */
@Getter
@Entity
@Immutable
@Table(name = "inventory_document_lines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InventoryDocumentLine {

    @Id
    private UUID id;

    @Column(name = "document_id", nullable = false)
    private UUID documentId;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @Column(name = "unit_id", nullable = false)
    private UUID unitId;

    @Column(nullable = false, precision = 14, scale = 4)
    private BigDecimal quantity;

    @Column(nullable = false, precision = 14, scale = 4)
    private BigDecimal factor;

    @Column(name = "base_quantity", nullable = false, precision = 14, scale = 4)
    private BigDecimal baseQuantity;

    @Column
    private String direction;

    @Column(name = "unit_cost", precision = 14, scale = 2)
    private BigDecimal unitCost;

    @Column(name = "expected_quantity", precision = 14, scale = 4)
    private BigDecimal expectedQuantity;

    @Column(name = "counted_quantity", precision = 14, scale = 4)
    private BigDecimal countedQuantity;

    public static InventoryDocumentLine of(UUID documentId, int lineNo, UUID productId, UUID unitId,
                                           BigDecimal quantity, BigDecimal factor, BigDecimal baseQuantity,
                                           String direction, BigDecimal unitCost, BigDecimal expectedQuantity,
                                           BigDecimal countedQuantity) {
        InventoryDocumentLine l = new InventoryDocumentLine();
        l.id = Ids.newId();
        l.documentId = documentId;
        l.lineNo = lineNo;
        l.productId = productId;
        l.unitId = unitId;
        l.quantity = quantity;
        l.factor = factor;
        l.baseQuantity = baseQuantity;
        l.direction = direction;
        l.unitCost = unitCost;
        l.expectedQuantity = expectedQuantity;
        l.countedQuantity = countedQuantity;
        return l;
    }
}
