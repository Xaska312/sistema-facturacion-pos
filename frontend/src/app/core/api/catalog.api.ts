import { HttpClient, HttpResponse, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Category,
  ImportReport,
  PageResponse,
  PriceList,
  Product,
  ProductInput,
  ProductModel,
  ProductModelInput,
  ProductModelRow,
  ProductModelUpdate,
  SizeScale,
  SizeScaleInput,
  Tax,
  TaxType,
  Unit,
} from './api.models';
import { SILENT_CLIENT_ERRORS } from '../errors/error.interceptor';
import { PageQuery, pageParams } from './organization.api';

export interface ProductQuery extends PageQuery {
  search?: string | null;
  categoryId?: string | null;
  includeInactive?: boolean;
  /** Falso en la lista de productos: las tallas se ven en su modelo (fase 8d). */
  includeVariants?: boolean;
}

export interface ProductModelQuery extends PageQuery {
  search?: string | null;
  /** Solo los de esa categoría (pestañas del POS). */
  categoryId?: string | null;
  includeInactive?: boolean;
}

/** Catálogo: productos, categorías, unidades, impuestos, listas de precios e importación. */
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);

  products(query: ProductQuery): Observable<PageResponse<Product>> {
    return this.http.get<PageResponse<Product>>('/api/v1/products', {
      params: pageParams(query, {
        search: query.search,
        categoryId: query.categoryId,
        includeInactive: query.includeInactive ? 'true' : null,
        includeVariants: query.includeVariants === false ? 'false' : null,
      }),
    });
  }

  // ---------------------------------------------------------------- tallas y colores (fase 8d)

  sizeScales(): Observable<SizeScale[]> {
    return this.http.get<SizeScale[]>('/api/v1/size-scales');
  }

  saveSizeScale(id: string | null, input: SizeScaleInput): Observable<SizeScale> {
    return id ? this.http.put<SizeScale>(`/api/v1/size-scales/${id}`, input)
      : this.http.post<SizeScale>('/api/v1/size-scales', input);
  }

  productModels(query: ProductModelQuery): Observable<PageResponse<ProductModelRow>> {
    return this.http.get<PageResponse<ProductModelRow>>('/api/v1/product-models', {
      params: pageParams(query, {
        search: query.search,
        categoryId: query.categoryId,
        includeInactive: query.includeInactive ? 'true' : null,
      }),
    });
  }

  productModel(id: string): Observable<ProductModel> {
    return this.http.get<ProductModel>(`/api/v1/product-models/${id}`);
  }

  createProductModel(input: ProductModelInput): Observable<ProductModel> {
    return this.http.post<ProductModel>('/api/v1/product-models', input);
  }

  updateProductModel(id: string, input: ProductModelUpdate): Observable<ProductModel> {
    return this.http.put<ProductModel>(`/api/v1/product-models/${id}`, input);
  }

  addVariants(id: string, sizes: string[], colors: string[]): Observable<ProductModel> {
    return this.http.post<ProductModel>(`/api/v1/product-models/${id}/variants`, { sizes, colors });
  }

  /** {@code barcode} o {@code active} nulos = no cambian. */
  updateVariant(modelId: string, productId: string, barcode: string | null, active: boolean | null)
    : Observable<ProductModel> {
    return this.http.put<ProductModel>(`/api/v1/product-models/${modelId}/variants/${productId}`, { barcode, active });
  }

  setProductModelActive(id: string, active: boolean): Observable<ProductModel> {
    return this.http.post<ProductModel>(`/api/v1/product-models/${id}/${active ? 'activate' : 'deactivate'}`, null);
  }

  /** Con {@code silent}, un 4xx (p. ej. un favorito que ya no existe) no muestra el toast global. */
  product(id: string, silent = false): Observable<Product> {
    return this.http.get<Product>(`/api/v1/products/${id}`, {
      context: new HttpContext().set(SILENT_CLIENT_ERRORS, silent),
    });
  }

  createProduct(input: ProductInput): Observable<Product> {
    return this.http.post<Product>('/api/v1/products', input);
  }

  updateProduct(id: string, input: ProductInput): Observable<Product> {
    return this.http.put<Product>(`/api/v1/products/${id}`, input);
  }

  setProductActive(id: string, active: boolean): Observable<Product> {
    return this.http.post<Product>(`/api/v1/products/${id}/${active ? 'activate' : 'deactivate'}`, null);
  }

  internalBarcode(): Observable<{ barcode: string }> {
    return this.http.post<{ barcode: string }>('/api/v1/barcodes/internal', null);
  }

  /** Plantilla de Excel (.xlsx) con las unidades e impuestos del negocio (fase 8f). */
  importTemplate(): Observable<HttpResponse<Blob>> {
    return this.http.get('/api/v1/products/import/template', { observe: 'response', responseType: 'blob' });
  }

  importProducts(file: File, dryRun: boolean): Observable<ImportReport> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ImportReport>('/api/v1/products/import', form, {
      params: new HttpParams().set('dryRun', dryRun),
    });
  }

  categories(): Observable<Category[]> {
    return this.http.get<Category[]>('/api/v1/categories');
  }

  saveCategory(id: string | null, name: string, parentId: string | null): Observable<Category> {
    const body = { name, parentId };
    return id ? this.http.put<Category>(`/api/v1/categories/${id}`, body) : this.http.post<Category>('/api/v1/categories', body);
  }

  units(): Observable<Unit[]> {
    return this.http.get<Unit[]>('/api/v1/units');
  }

  createUnit(code: string, name: string, allowsDecimals: boolean): Observable<Unit> {
    return this.http.post<Unit>('/api/v1/units', { code, name, allowsDecimals });
  }

  updateUnit(id: string, name: string, allowsDecimals: boolean): Observable<Unit> {
    return this.http.put<Unit>(`/api/v1/units/${id}`, { name, allowsDecimals });
  }

  taxes(): Observable<Tax[]> {
    return this.http.get<Tax[]>('/api/v1/taxes');
  }

  /**
   * Asistente del impuesto al consumo (Fase 12b-5): deja "INC 8 %" activo y lo asigna a los productos de esas
   * categorías (y sus subcategorías).
   */
  applyConsumptionTax(categoryIds: string[]): Observable<ConsumptionTaxResult> {
    return this.http.post<ConsumptionTaxResult>('/api/v1/taxes/consumption', { categoryIds });
  }

  createTax(code: string, name: string, type: TaxType, rate: number): Observable<Tax> {
    return this.http.post<Tax>('/api/v1/taxes', { code, name, type, rate });
  }

  updateTax(id: string, name: string, rate: number): Observable<Tax> {
    return this.http.put<Tax>(`/api/v1/taxes/${id}`, { name, rate });
  }

  priceLists(): Observable<PriceList[]> {
    return this.http.get<PriceList[]>('/api/v1/price-lists');
  }

  createPriceList(code: string, name: string): Observable<PriceList> {
    return this.http.post<PriceList>('/api/v1/price-lists', { code, name });
  }

  renamePriceList(id: string, name: string): Observable<PriceList> {
    return this.http.put<PriceList>(`/api/v1/price-lists/${id}`, { name });
  }

  /** Activa o desactiva una categoría, unidad, impuesto o lista de precios. */
  setActive(resource: 'categories' | 'units' | 'taxes' | 'price-lists', id: string, active: boolean): Observable<unknown> {
    return this.http.post(`/api/v1/${resource}/${id}/${active ? 'activate' : 'deactivate'}`, null);
  }
}

export interface ConsumptionTaxResult {
  taxId: string;
  taxName: string;
  categories: number;
  products: number;
}
