import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetail } from '../api/api.models';

export interface FieldProblem {
  field: string;
  message: string;
}

/**
 * Nombres de campo de la API → etiqueta en español, para no mostrar nombres técnicos ("cityCode") al usuario.
 * Si falta alguno se muestra solo el mensaje.
 */
export const FIELD_LABELS: Record<string, string> = {
  code: 'Código',
  name: 'Nombre',
  address: 'Dirección',
  phone: 'Teléfono',
  email: 'Correo',
  cityCode: 'Municipio',
  branchId: 'Sucursal',
  documentType: 'Tipo de documento',
  documentNumber: 'Número de documento',
  verificationDigit: 'Dígito de verificación',
  firstNames: 'Nombres',
  lastNames: 'Apellidos',
  businessName: 'Razón social',
  personType: 'Tipo de persona',
  priceListId: 'Lista de precios',
  creditLimit: 'Cupo de crédito',
  parentId: 'Categoría padre',
  rate: 'Tarifa',
  type: 'Tipo',
  allowsDecimals: 'Admite decimales',
  sku: 'SKU',
  barcode: 'Código de barras',
  salePrice: 'Precio de venta',
  cost: 'Costo',
  taxId: 'Impuesto',
  baseUnitId: 'Unidad',
  categoryId: 'Categoría',
  password: 'Contraseña',
  fullName: 'Nombre completo',
  legalName: 'Razón social',
  tradeName: 'Nombre comercial',
  slug: 'Identificador',
  reason: 'Motivo',
  amount: 'Valor',
  quantity: 'Cantidad',
};

/** Errores de campo de un ProblemDetail (400 de validación); vacío si no hay. */
export function problemFieldErrors(error: unknown): FieldProblem[] {
  if (!(error instanceof HttpErrorResponse)) {
    return [];
  }
  const problem = error.error as (ProblemDetail & { properties?: Pick<ProblemDetail, 'errors'> }) | null;
  return problem?.errors ?? problem?.properties?.errors ?? [];
}

/** "Correo: no es válido"; sin etiqueta conocida, solo el mensaje. */
export function fieldProblemText(problem: FieldProblem): string {
  const label = FIELD_LABELS[problem.field];
  return label ? `${label}: ${problem.message}` : capitalize(problem.message);
}

/** Título corto del error para el toast. */
export function problemTitle(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Sin conexión';
    }
    if (error.status >= 500) {
      return 'Algo salió mal';
    }
    const title = (error.error as ProblemDetail | null)?.title;
    if (title) {
      return title;
    }
  }
  return 'No se pudo completar la acción';
}

/** Mensaje legible en español a partir de un error HTTP (ProblemDetail del backend). */
export function problemMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
    }
    const errors = problemFieldErrors(error);
    if (errors.length) {
      return errors.map(fieldProblemText).join(' · ');
    }
    const problem = error.error as ProblemDetail | null;
    if (problem?.detail) {
      return problem.detail;
    }
    if (error.status >= 500) {
      return 'Ocurrió un error en el servidor. Inténtalo de nuevo en un momento.';
    }
  }
  return 'Ocurrió un error inesperado.';
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('es-CO') + text.slice(1);
}
