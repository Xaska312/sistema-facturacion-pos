package com.poshibrido.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/**
 * Ficha del medicamento de un producto (Fase 13-1, decisión 279; tenant V28). Las reglas de la condición de venta,
 * antibióticos y venta por unidad las revisa {@code MedicineService} y las vuelve a exigir la base de datos.
 */
@Getter
@Entity
@Table(name = "product_medicines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProductMedicine {

    @Id
    @Column(name = "product_id")
    private UUID productId;

    @Column(nullable = false, length = 20)
    private String kind;

    @Column(name = "sanitary_registration", length = 80)
    private String sanitaryRegistration;

    @Column(length = 30)
    private String cum;

    @Column(name = "active_ingredients", length = 1000)
    private String activeIngredients;

    @Column(name = "dosage_form", length = 200)
    private String dosageForm;

    @Column(length = 120)
    private String route;

    @Column(length = 10)
    private String atc;

    @Column(length = 300)
    private String holder;

    @Column(name = "sale_condition", length = 20)
    private String saleCondition;

    @Column(nullable = false)
    private boolean antibiotic;

    @Column(name = "cold_chain", nullable = false)
    private boolean coldChain;

    @Column(name = "unit_sale", nullable = false)
    private boolean unitSale;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "updated_by", nullable = false)
    private UUID updatedBy;

    public static ProductMedicine create(UUID productId, UUID actor) {
        ProductMedicine m = new ProductMedicine();
        m.productId = productId;
        m.createdAt = Instant.now();
        m.updatedAt = m.createdAt;
        m.updatedBy = actor;
        return m;
    }

    public void apply(Data data, UUID actor) {
        this.kind = data.kind();
        this.sanitaryRegistration = data.sanitaryRegistration();
        this.cum = data.cum();
        this.activeIngredients = data.activeIngredients();
        this.dosageForm = data.dosageForm();
        this.route = data.route();
        this.atc = data.atc();
        this.holder = data.holder();
        this.saleCondition = data.saleCondition();
        this.antibiotic = data.antibiotic();
        this.coldChain = data.coldChain();
        this.unitSale = data.unitSale();
        this.updatedAt = Instant.now();
        this.updatedBy = actor;
    }

    /** Datos ya validados y normalizados. */
    public record Data(String kind, String sanitaryRegistration, String cum, String activeIngredients, String dosageForm,
                       String route, String atc, String holder, String saleCondition, boolean antibiotic,
                       boolean coldChain, boolean unitSale) {
    }
}
