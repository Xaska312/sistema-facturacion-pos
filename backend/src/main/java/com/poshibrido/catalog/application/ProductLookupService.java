package com.poshibrido.catalog.application;

import com.poshibrido.catalog.domain.PriceList;
import com.poshibrido.catalog.domain.PriceListItemId;
import com.poshibrido.catalog.domain.Product;
import com.poshibrido.catalog.domain.ProductBarcode;
import com.poshibrido.catalog.domain.Tax;
import com.poshibrido.catalog.domain.Unit;
import com.poshibrido.catalog.infrastructure.PriceListItemRepository;
import com.poshibrido.catalog.infrastructure.PriceListRepository;
import com.poshibrido.catalog.infrastructure.ProductBarcodeRepository;
import com.poshibrido.catalog.infrastructure.ProductRepository;
import com.poshibrido.catalog.infrastructure.TaxRepository;
import com.poshibrido.catalog.infrastructure.UnitRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Resolución de un código escaneado (código de barras o SKU) a producto, unidad y precio.
 * Es lo que usará la pantalla de venta con el lector de código de barras.
 */
@Service
@RequiredArgsConstructor
public class ProductLookupService implements PricingApi {

    private final ProductBarcodeRepository barcodes;
    private final ProductRepository products;
    private final PriceListRepository priceLists;
    private final PriceListItemRepository listItems;
    private final UnitRepository units;
    private final TaxRepository taxes;

    @Transactional(readOnly = true)
    public ResolvedPrice lookup(String rawCode, UUID priceListId) {
        String code = rawCode == null ? "" : rawCode.trim();
        if (code.isEmpty()) {
            throw new BusinessRuleException("Indica un código de barras o SKU.");
        }
        ProductBarcode barcode = barcodes.findByBarcode(code).orElse(null);
        if (barcode != null) {
            Product product = barcode.getProduct();
            return resolve(product, barcode.getUnitId() == null ? product.getBaseUnitId() : barcode.getUnitId(), priceListId);
        }
        Product bySku = products.findBySkuIgnoreCase(code)
                .orElseThrow(() -> new NotFoundException("No hay ningún producto con el código " + code + "."));
        return resolve(bySku, bySku.getBaseUnitId(), priceListId);
    }

    @Override
    @Transactional(readOnly = true)
    public ResolvedPrice price(UUID productId, UUID unitId, UUID priceListId) {
        Product product = products.findById(productId)
                .orElseThrow(() -> new NotFoundException("Producto no encontrado."));
        return resolve(product, unitId == null ? product.getBaseUnitId() : unitId, priceListId);
    }

    private ResolvedPrice resolve(Product product, UUID unitId, UUID priceListId) {
        if (!product.isActive()) {
            throw new BusinessRuleException("El producto " + product.getName() + " está inactivo.");
        }
        BigDecimal general = product.generalPrice(unitId)
                .orElseThrow(() -> new BusinessRuleException("La unidad indicada no es una presentación del producto."));
        BigDecimal factor = unitId.equals(product.getBaseUnitId())
                ? BigDecimal.ONE
                : product.conversionFor(unitId).orElseThrow().getFactor();

        BigDecimal price = general;
        UUID appliedList = null;
        boolean fromList = false;
        if (priceListId != null) {
            PriceList list = priceLists.findById(priceListId)
                    .orElseThrow(() -> new BusinessRuleException("La lista de precios no existe."));
            appliedList = list.getId();
            if (list.isActive() && !list.isDefaultList()) {
                var item = listItems.findById(new PriceListItemId(list.getId(), product.getId(), unitId));
                if (item.isPresent()) {
                    price = item.get().getPrice();
                    fromList = true;
                }
            }
        }
        Unit unit = units.findById(unitId).orElseThrow();
        Tax tax = taxes.findById(product.getTaxId()).orElseThrow();
        return new ResolvedPrice(product.getId(), product.getSku(), product.getName(), unitId, unit.getCode(), factor,
                price, appliedList, fromList, tax.getId(), tax.getType(), tax.getRate(), product.isTrackInventory());
    }
}
