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
import java.math.RoundingMode;
import java.util.Optional;
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
    private final ScaleService scale;

    /**
     * Lo leído por el lector del POS. Con una etiqueta de báscula: {@code scaleQuantity} = el peso, o
     * {@code scaleAmount} = el precio de la etiqueta (la pantalla calcula la cantidad con el IVA y la lista del cliente).
     */
    public record Scanned(ResolvedPrice price, BigDecimal scaleQuantity, BigDecimal scaleAmount) {
    }

    /**
     * Lector del POS (fase 8e): un código de barras registrado manda (también los internos que empiezan por 29);
     * si no, una etiqueta de báscula con el formato configurado; si no, el SKU. Si la etiqueta trae un PLU sin
     * asignar y tampoco es un SKU, se avisa del PLU.
     */
    @Transactional(readOnly = true)
    public Scanned scan(String rawCode, UUID priceListId) {
        String code = rawCode == null ? "" : rawCode.trim();
        if (!code.isEmpty() && barcodes.findByBarcode(code).isEmpty()) {
            Optional<ScaleService.ScaleHit> hit = scale.resolve(code);
            if (hit.isPresent()) {
                ScaleService.ScaleHit h = hit.get();
                if (h.productId() == null) {
                    if (products.findBySkuIgnoreCase(code).isPresent()) {
                        return new Scanned(lookup(code, priceListId), null, null);
                    }
                    throw new NotFoundException("El PLU " + h.plu() + " de la báscula no está asignado a ningún "
                            + "producto (Productos → Báscula).");
                }
                ResolvedPrice price = price(h.productId(), null, priceListId);
                if (h.value().signum() <= 0) {
                    throw new BusinessRuleException("La etiqueta de la báscula trae cantidad 0.");
                }
                return h.kind() == ScaleLabels.Kind.WEIGHT
                        ? new Scanned(price, h.value().setScale(3, RoundingMode.HALF_UP), null)
                        : new Scanned(price, null, h.value());
            }
        }
        return new Scanned(lookup(code, priceListId), null, null);
    }

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
                price, appliedList, fromList, tax.getId(), tax.getType(), tax.getRate(), product.isTrackInventory(),
                product.isOpenPrice());
    }
}
