package com.poshibrido.organization.application;

import com.poshibrido.catalog.application.BranchSaleCategories;
import com.poshibrido.dining.application.DiningMenuService;
import com.poshibrido.dining.application.DiningMenuService.MenuInput;
import com.poshibrido.dining.application.DiningService;
import com.poshibrido.organization.application.BranchService.BranchData;
import com.poshibrido.organization.domain.Branch;
import com.poshibrido.organization.domain.CashRegister;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.domain.BusinessModule;
import com.poshibrido.tenancy.domain.PlanFeature;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Asistente de "Nueva sucursal" (decisión 378): en un solo paso crea la sucursal, su caja y, si es un restaurante,
 * el salón con sus mesas y la carta; además guarda qué vende. Todo o nada: si algo falla no queda una sucursal a
 * medias. Lo que el plan no permite (la carta sin plan Empresa) no detiene el resto: se informa en {@code notes}.
 */
@Service
@RequiredArgsConstructor
public class BranchSetupService {

    static final int MAX_SETUP_TABLES = 60;
    static final int DEFAULT_SEATS = 4;

    private final BranchService branches;
    private final CashRegisterService registers;
    private final DiningService dining;
    private final DiningMenuService menus;
    private final BranchSaleCategories saleCategories;

    /**
     * {@code registerName} nulo o vacío: sin caja propia. {@code tables} > 0: salón con mesas 1..N (necesita el
     * módulo de Mesas encendido). {@code menuCategoryIds}: la carta de las mesas. {@code sellsAll} falso: solo las
     * {@code saleCategoryIds}.
     */
    public record SetupInput(String code, BranchData data, String registerName, String zoneName, int tables,
                             List<UUID> menuCategoryIds, boolean sellsAll, List<UUID> saleCategoryIds) {
    }

    public record SetupResult(Branch branch, UUID cashRegisterId, UUID zoneId, int tables, UUID menuId,
                              List<String> notes) {
    }

    @Transactional
    public SetupResult setup(SetupInput input) {
        if (input.tables() < 0 || input.tables() > MAX_SETUP_TABLES) {
            throw new BusinessRuleException("Las mesas iniciales van de 0 a " + MAX_SETUP_TABLES
                    + ". Después puedes agregar más en Mesas › Configurar.");
        }
        boolean hasTables = input.tables() > 0;
        if (hasTables && !CurrentActor.permissions().contains(BusinessModule.TABLES.authority())) {
            throw new BusinessRuleException("Para crear mesas, primero enciende Mesas en Ajustes › Tipo de negocio.");
        }
        List<String> notes = new ArrayList<>();
        Branch branch = branches.create(input.code(), input.data());

        UUID registerId = null;
        String registerName = input.registerName() == null ? "" : input.registerName().trim();
        if (!registerName.isEmpty()) {
            CashRegister register = registers.create(branch.getId(), "CAJA-1", registerName, true);
            registerId = register.getId();
        }

        UUID zoneId = null;
        if (hasTables) {
            String zoneName = input.zoneName() == null || input.zoneName().isBlank() ? "Salón" : input.zoneName();
            zoneId = dining.createZone(branch.getId(), zoneName).id();
            for (int i = 1; i <= input.tables(); i++) {
                dining.createTable(zoneId, String.valueOf(i), DEFAULT_SEATS);
            }
        }

        UUID menuId = null;
        List<UUID> menuCategories = input.menuCategoryIds() == null ? List.of() : input.menuCategoryIds();
        if (hasTables && !menuCategories.isEmpty()) {
            if (!CurrentActor.permissions().contains(PlanFeature.ZONE_REGISTERS.authority())) {
                notes.add("La carta no se creó: las cartas por piso están en el plan Empresa. Mientras tanto las mesas "
                        + "muestran lo que vende la sucursal.");
            } else if (registerId == null) {
                notes.add("La carta no se creó porque la sucursal no tiene caja. Créala en Mesas › Cartas por piso.");
            } else {
                menuId = menus.create(branch.getId(), new MenuInput(menuName(branch.getName()), registerId, true, 0,
                        menuCategories, List.of())).id();
            }
        }

        if (!input.sellsAll()) {
            saleCategories.set(branch.getId(), false, input.saleCategoryIds());
        }
        return new SetupResult(branch, registerId, zoneId, input.tables(), menuId, notes);
    }

    /** "Carta de Restaurante Doña Rosa" si cabe (40 letras); si no, "Carta". */
    static String menuName(String branchName) {
        String name = "Carta de " + branchName.trim();
        return name.length() <= 40 ? name : "Carta";
    }
}
