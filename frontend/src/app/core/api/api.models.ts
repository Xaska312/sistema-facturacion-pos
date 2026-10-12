/** Modelos de la API (espejo de los DTO del backend). */

export type BusinessType = 'RETAIL' | 'PHARMACY' | 'RESTAURANT' | 'SERVICES';
export type TenantStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'FAILED';

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  platformAdmin: boolean;
  /** Confirmó su correo con el enlace que le llegó (requisito para crear un negocio). */
  emailVerified: boolean;
}

export interface TenantSummary {
  id: string;
  slug: string;
  legalName: string;
  tradeName: string;
  businessType: BusinessType;
  status: TenantStatus;
  owner: boolean;
  /** Motivo de la suspensión (solo si está suspendido). */
  suspensionReason?: string | null;
  /** Suspendido porque su dueño lo cerró ("eliminó"). */
  closedByOwner?: boolean;
}

export interface SessionResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserSummary;
  tenantId: string | null;
  permissions: string[];
  tenants: TenantSummary[];
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
}

export interface CreateTenantRequest {
  slug: string;
  legalName: string;
  tradeName: string;
  businessType: BusinessType;
  activationCode?: string;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  cityCode: string | null;
  phone: string | null;
  active: boolean;
}

/** Error RFC 9457 devuelto por el backend. */
export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  errors?: { field: string; message: string }[];
}

// ---------------------------------------------------------------- Fase 2

export interface CashRegister {
  id: string;
  branchId: string;
  code: string;
  name: string;
  active: boolean;
}

export interface BranchInput {
  name: string;
  address: string | null;
  cityCode: string | null;
  phone: string | null;
}

export interface Permission {
  code: string;
  module: string;
  description: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  systemRole: boolean;
  /** false solo para OWNER. */
  editable: boolean;
  permissions: string[];
  memberCount: number;
}

export interface RoleInput {
  name: string;
  description: string | null;
  permissions: string[];
}

export interface RoleRef {
  id: string;
  code: string;
  name: string;
}

export interface BranchRef {
  id: string;
  code: string;
  name: string;
}

export interface Member {
  id: string;
  displayName: string;
  email: string | null;
  active: boolean;
  owner: boolean;
  roles: RoleRef[];
  branches: BranchRef[];
  defaultBranchId: string | null;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

export interface Invitation {
  id: string;
  email: string;
  status: InvitationStatus;
  expired: boolean;
  expiresAt: string;
  createdAt: string;
  invitedByName: string | null;
  roles: RoleRef[];
  branches: BranchRef[];
}

export interface InvitationCreated {
  invitation: Invitation;
  /** Se entrega una sola vez; con él se arma el enlace. */
  token: string;
}

export interface InvitationPreview {
  tenantName: string;
  email: string;
  invitedByName: string | null;
  status: InvitationStatus;
  expired: boolean;
  expiresAt: string;
}

export interface InvitationAccepted {
  tenantId: string;
  tenantName: string;
}

export interface BusinessSettings {
  allowNegativeStock: boolean;
  pricesIncludeTax: boolean;
  timezone: string;
  currency: string;
  receiptFooter: string;
  maxDiscountPercent: number;
}

export interface Department {
  code: string;
  name: string;
}

export interface City {
  code: string;
  name: string;
  departmentCode: string;
}

// ---------------------------------------------------------------- Fase 3: catálogo

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  active: boolean;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  allowsDecimals: boolean;
  active: boolean;
}

export type TaxType = 'IVA' | 'INC' | 'EXEMPT' | 'EXCLUDED';

export interface Tax {
  id: string;
  code: string;
  name: string;
  type: TaxType;
  rate: number;
  active: boolean;
}

export interface PriceList {
  id: string;
  code: string;
  name: string;
  defaultList: boolean;
  active: boolean;
}

export interface ProductConversion {
  unitId: string;
  unitCode: string | null;
  factor: number;
  salePrice: number | null;
  effectivePrice: number | null;
}

export interface ProductBarcode {
  barcode: string;
  unitId: string | null;
  unitCode: string | null;
  internal: boolean;
}

export interface ProductListPrice {
  priceListId: string;
  priceListName: string | null;
  unitId: string;
  unitCode: string | null;
  price: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  baseUnitId: string;
  baseUnitCode: string | null;
  taxId: string;
  taxCode: string | null;
  taxType: TaxType | null;
  taxRate: number | null;
  cost: number;
  /** El costo lo calcula el inventario (promedio ponderado): no se edita. */
  costLocked: boolean;
  salePrice: number;
  trackInventory: boolean;
  tracksLots: boolean;
  active: boolean;
  conversions: ProductConversion[];
  barcodes: ProductBarcode[];
  listPrices: ProductListPrice[];
  /** Talla de un modelo (fase 8d): el modelo, la talla y el color; null en un producto normal. */
  modelId?: string | null;
  variantSize?: string | null;
  variantColor?: string | null;
}

export interface ProductInput {
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  baseUnitId: string;
  taxId: string;
  cost: number;
  salePrice: number;
  trackInventory: boolean;
  conversions: { unitId: string; factor: number; salePrice: number | null }[];
  barcodes: { barcode: string; unitId: string | null; internal: boolean }[];
  listPrices: { priceListId: string; unitId: string; price: number }[];
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportReport {
  totalRows: number;
  toCreate: number;
  toUpdate: number;
  newCategories: string[];
  errors: ImportRowError[];
  applied: boolean;
}

// ---------------------------------------------------------------- Fase 3: terceros

export type PersonType = 'NATURAL' | 'LEGAL';
export type DocumentType = 'CC' | 'CE' | 'NIT' | 'PASSPORT' | 'TI' | 'PEP' | 'PPT' | 'TE' | 'RC' | 'NUIP' | 'FOREIGN_ID'
  | 'FOREIGN_NIT';

export interface Party {
  id: string;
  personType: PersonType;
  documentType: DocumentType;
  documentNumber: string;
  verificationDigit: number | null;
  formattedDocument: string;
  displayName: string;
  firstNames: string | null;
  lastNames: string | null;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  cityCode: string | null;
  active: boolean;
  system: boolean;
  priceListId: string | null;
  priceListName: string | null;
  creditLimit: number | null;
  alsoCustomer: boolean;
  alsoSupplier: boolean;
}

export interface PartyInput {
  personType: PersonType;
  documentType: DocumentType;
  documentNumber: string;
  verificationDigit: number | null;
  firstNames: string | null;
  lastNames: string | null;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  cityCode: string | null;
  /** Solo clientes. */
  priceListId?: string | null;
  creditLimit?: number | null;
}

// ---------------------------------------------------------------- Fase 4: inventario

export type StockStatus = 'LOW' | 'OK' | 'OVER';
export type MovementType =
  | 'INITIAL'
  | 'PURCHASE'
  | 'SALE'
  | 'SALE_VOID'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'RETURN';
export type InventoryDocumentType = 'INITIAL' | 'ADJUSTMENT' | 'TRANSFER' | 'COUNT';
export type Direction = 'IN' | 'OUT';

export interface StockRow {
  branchId: string;
  productId: string;
  sku: string;
  name: string;
  unitCode: string;
  quantity: number;
  minStock: number | null;
  maxStock: number | null;
  status: StockStatus;
  averageCost: number;
  stockValue: number;
}

export interface StockAlert {
  branchId: string;
  branchName: string | null;
  productId: string;
  sku: string;
  name: string;
  unitCode: string;
  quantity: number;
  minStock: number;
}

export interface KardexRow {
  entryNo: number;
  createdAt: string;
  branchId: string;
  branchName: string | null;
  type: MovementType;
  quantity: number;
  unitCost: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  documentNumber: number | null;
  reason: string | null;
  createdByName: string | null;
}

export interface InventoryDocumentLine {
  lineNo: number;
  productId: string;
  sku: string | null;
  name: string | null;
  unitId: string;
  unitCode: string | null;
  quantity: number;
  factor: number;
  baseQuantity: number;
  direction: Direction | null;
  unitCost: number | null;
  expectedQuantity: number | null;
  countedQuantity: number | null;
  difference: number | null;
}

export interface InventoryDocument {
  id: string;
  number: number;
  type: InventoryDocumentType;
  branchId: string;
  branchName: string | null;
  targetBranchId: string | null;
  targetBranchName: string | null;
  reason: string | null;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  lineCount: number;
  lines: InventoryDocumentLine[];
}

export interface InventoryLineInput {
  productId: string;
  unitId: string | null;
  quantity: number;
  direction?: Direction | null;
  unitCost?: number | null;
  /** Conteos: existencia en unidad base que mostraba el sistema al empezar a contar ese producto. */
  expectedQuantity?: number | null;
}

export interface ProductLookup {
  productId: string;
  sku: string;
  name: string;
  unitId: string;
  unitCode: string;
  factor: number;
  price: number;
  priceListId: string | null;
  fromList: boolean;
  taxId: string;
  taxType: TaxType;
  taxRate: number;
  trackInventory: boolean;
}

// ---------------------------------------------------------------- Caja (Fase 5)

export type CashSessionStatus = 'OPEN' | 'CLOSED';
export type CashMovementType = 'SALE' | 'SALE_VOID' | 'INCOME' | 'EXPENSE' | 'WITHDRAWAL';
export type ManualCashMovementType = 'INCOME' | 'EXPENSE' | 'WITHDRAWAL';

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  affectsCash: boolean;
  requiresReference: boolean;
}

export interface RegisterOption {
  id: string;
  code: string;
  name: string;
  branchId: string;
  branchName: string;
  busy: boolean;
  busyBy: string | null;
}

export interface CashSession {
  id: string;
  cashRegisterId: string;
  registerCode: string | null;
  registerName: string | null;
  branchId: string;
  branchName: string | null;
  status: CashSessionStatus;
  openedBy: string;
  openedByName: string | null;
  openedAt: string;
  openingAmount: number;
  openingNotes: string | null;
  closedAt: string | null;
  closedBy: string | null;
  closedByName: string | null;
  countedAmount: number | null;
  /** Solo con el permiso cash:audit (cierre ciego). */
  expectedAmount: number | null;
  difference: number | null;
  closingNotes: string | null;
  mine: boolean;
}

export interface CashMovement {
  entryNo: number | null;
  id: string;
  type: CashMovementType;
  amount: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface MethodTotal {
  paymentMethodId: string;
  code: string | null;
  name: string | null;
  amount: number;
  count: number;
}

export interface CashSection {
  opening: number;
  sales: number;
  voidRefunds: number;
  incomes: number;
  expenses: number;
  withdrawals: number;
  expected: number | null;
  counted: number | null;
  difference: number | null;
}

export interface CashReport {
  session: CashSession;
  salesCount: number;
  salesTotal: number;
  voidedCount: number;
  voidedTotal: number;
  netSales: number;
  byMethod: MethodTotal[];
  voidsHereCount: number;
  /** Ventas de esta caja anuladas después de cerrarla: no cambian el cierre (se informan aparte). */
  voidedAfterCloseCount: number;
  voidedAfterCloseTotal: number;
  cash: CashSection;
  auditView: boolean;
}

// ---------------------------------------------------------------- Ventas (Fase 5)

export type SaleStatus = 'COMPLETED' | 'VOIDED';

export interface SaleRow {
  id: string;
  documentNumber: string;
  number: number;
  status: SaleStatus;
  createdAt: string;
  branchId: string;
  branchName: string | null;
  cashRegisterId: string;
  registerCode: string | null;
  customerName: string;
  customerDocument: string;
  total: number;
  itemCount: number;
  createdBy: string;
  createdByName: string | null;
}

export interface SaleItem {
  lineNo: number;
  productId: string;
  sku: string;
  name: string;
  unitId: string;
  unitCode: string;
  quantity: number;
  unitPrice: number;
  grossAmount: number;
  discountPercent: number;
  discountAmount: number;
  taxType: string;
  taxRate: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
}

export interface SalePayment {
  lineNo: number;
  paymentMethodId: string;
  methodCode: string;
  methodName: string;
  amount: number;
  tendered: number;
  reference: string | null;
}

export interface SaleTax {
  taxId: string;
  taxType: string;
  taxRate: number;
  taxableBase: number;
  taxAmount: number;
}

export interface ReceiptHeader {
  businessName: string | null;
  branchName: string | null;
  branchAddress: string | null;
  branchPhone: string | null;
  registerCode: string | null;
  registerName: string | null;
  footer: string | null;
  timezone: string | null;
}

export interface Sale {
  id: string;
  documentNumber: string;
  prefix: string;
  number: number;
  status: SaleStatus;
  createdAt: string;
  branchId: string;
  cashRegisterId: string;
  cashSessionId: string;
  customerId: string;
  customerDocumentType: string;
  customerDocumentNumber: string;
  customerVerificationDigit: number | null;
  customerName: string;
  pricesIncludeTax: boolean;
  grossTotal: number;
  discountTotal: number;
  subtotal: number;
  taxTotal: number;
  total: number;
  paidTotal: number;
  changeAmount: number;
  notes: string | null;
  createdBy: string;
  createdByName: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  items: SaleItem[];
  payments: SalePayment[];
  taxes: SaleTax[];
  receipt: ReceiptHeader;
}

export interface PosConfig {
  pricesIncludeTax: boolean;
  maxDiscountPercent: number;
  allowNegativeStock: boolean;
  currency: string;
  receiptFooter: string | null;
  businessName: string;
  finalConsumerId: string;
}

export interface SaleItemInput {
  productId: string;
  unitId: string | null;
  quantity: number;
  discountPercent: number | null;
  /** Precio que muestra la pantalla: si el vigente es otro, el backend responde 409. */
  unitPrice: number | null;
}

export interface SalePaymentInput {
  paymentMethodId: string;
  amount: number;
  reference: string | null;
}

export interface SaleInput {
  customerId: string | null;
  items: SaleItemInput[];
  payments: SalePaymentInput[];
  expectedTotal: number | null;
  notes: string | null;
}

/** Detalle del 409 cuando cambiaron precios. */
export interface PriceChange {
  line: number;
  sku: string;
  name: string;
  expectedPrice: number;
  currentPrice: number;
}

// ---------------------------------------------------------------- Reportes (Fase 6)

export interface ReportSummary {
  from: string;
  to: string;
  salesCount: number;
  grossTotal: number;
  discountTotal: number;
  subtotal: number;
  taxTotal: number;
  total: number;
  averageTicket: number;
  cost: number;
  profit: number;
  marginPercent: number;
  voidedCount: number;
  voidedTotal: number;
}

/** Fila agrupada por día, sucursal o vendedor. */
export interface SalesReportRow {
  key: string;
  label: string;
  salesCount: number;
  subtotal: number;
  taxTotal: number;
  total: number;
  averageTicket: number;
  cost: number;
  profit: number;
  marginPercent: number;
}

export interface PaymentReportRow {
  paymentMethodId: string;
  code: string;
  name: string;
  count: number;
  amount: number;
}

export interface ProductReportRow {
  productId: string;
  sku: string;
  name: string;
  categoryName: string | null;
  unitCode: string;
  quantity: number;
  subtotal: number;
  total: number;
  cost: number;
  profit: number;
  marginPercent: number;
}

export interface CategoryReportRow {
  categoryId: string | null;
  categoryName: string;
  subtotal: number;
  total: number;
  cost: number;
  profit: number;
  marginPercent: number;
}

export interface TaxReportRow {
  taxType: string;
  taxRate: number;
  salesCount: number;
  taxableBase: number;
  taxAmount: number;
}

export interface InventoryValuationRow {
  branchId: string;
  branchName: string;
  productId: string;
  sku: string;
  name: string;
  categoryName: string | null;
  unitCode: string;
  quantity: number;
  averageCost: number;
  value: number;
}

export interface InventoryValuation {
  rows: InventoryValuationRow[];
  totalValue: number;
  productCount: number;
}

export interface Dashboard {
  date: string;
  today: ReportSummary;
  yesterdayTotal: number;
  byHour: { hour: number; salesCount: number; total: number }[];
  last7Days: { date: string; salesCount: number; total: number }[];
  topProducts: ProductReportRow[];
  byPaymentMethod: PaymentReportRow[];
}

export interface MyDay {
  date: string;
  salesCount: number;
  total: number;
  averageTicket: number;
  byPaymentMethod: PaymentReportRow[];
}

// ---------------------------------------------------------------- Fase 8b: suscripciones

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED';
export type BillingCycle = 'MONTHLY' | 'ANNUAL';

export interface Plan {
  code: string;
  name: string;
  maxBranches: number | null;
  maxUsers: number | null;
  monthlyPrice: number | null;
  annualPrice: number | null;
  active: boolean;
}

export interface SubscriptionPayment {
  id: string;
  planCode: string;
  billingCycle: BillingCycle;
  periods: number;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  periodStart: string;
  periodEnd: string;
  source: 'PAYMENT' | 'CODE';
  createdAt: string;
}

export interface Subscription {
  tenantId: string;
  tradeName: string;
  plan: Plan;
  status: SubscriptionStatus;
  trial: boolean;
  billingCycle: BillingCycle;
  startedAt: string;
  endsAt: string;
  graceEndsAt: string | null;
  daysLeft: number;
  usage: { branches: number; users: number };
  /** Instrucciones de pago configuradas en el servidor. */
  paymentInstructions: string;
  payments: SubscriptionPayment[];
}

export interface SubscriptionRow {
  tenantId: string;
  slug: string;
  tradeName: string;
  tenantStatus: TenantStatus;
  ownerEmail: string;
  ownerName: string;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  trial: boolean;
  endsAt: string;
  daysLeft: number;
}

export type ActivationCodeStatus = 'AVAILABLE' | 'USED' | 'EXPIRED' | 'REVOKED';

export interface ActivationCode {
  id: string;
  hint: string;
  planCode: string;
  planName: string;
  months: number;
  note: string | null;
  status: ActivationCodeStatus;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
  usedTenantName: string | null;
}

export interface CreatedCodes {
  codes: string[];
  details: ActivationCode[];
}

export interface PaymentInput {
  planCode: string;
  billingCycle: BillingCycle;
  periods: number;
  amount: number;
  method: string;
  reference?: string | null;
  notes?: string | null;
}

export interface PlanInput {
  name: string;
  maxBranches: number | null;
  maxUsers: number | null;
  monthlyPrice: number | null;
  annualPrice: number | null;
  active: boolean;
}

export interface CodeInput {
  planCode: string;
  months: number;
  validDays: number;
  note?: string | null;
  quantity: number;
}

// ---------------------------------------------------------------- Fase 8d: tallas y colores

export interface SizeEntry {
  label: string;
  /** Equivalencia en texto libre (p. ej. "EU 39"); la llena cada negocio. */
  equivalent: string | null;
}

export interface SizeScale {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sizes: SizeEntry[];
}

export interface SizeScaleInput {
  name: string;
  active: boolean;
  sizes: SizeEntry[];
}

export interface ProductModelRow {
  id: string;
  skuPrefix: string;
  name: string;
  categoryName: string | null;
  salePrice: number;
  sizeScaleName: string | null;
  /** Cantidad de variantes (talla × color). */
  variants: number;
  active: boolean;
}

export interface ProductVariant {
  productId: string;
  sku: string;
  /** "Tenis Runner T38 Negro". */
  name: string;
  size: string;
  color: string | null;
  barcode: string | null;
  baseUnitId: string;
  baseUnitCode: string;
  active: boolean;
}

export interface ProductModel {
  id: string;
  skuPrefix: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  taxId: string;
  taxCode: string | null;
  cost: number;
  salePrice: number;
  sizeScaleId: string;
  sizeScaleName: string;
  active: boolean;
  /** Tallas del modelo en el orden de la escala. */
  sizes: string[];
  /** Colores en el orden en que se crearon (vacío si el modelo no maneja colores). */
  colors: string[];
  variants: ProductVariant[];
}

export interface ProductModelInput {
  skuPrefix: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  taxId: string;
  cost: number | null;
  salePrice: number;
  sizeScaleId: string;
  sizes: string[];
  colors: string[];
}

export type ProductModelUpdate = Omit<ProductModelInput, 'skuPrefix' | 'sizeScaleId' | 'sizes' | 'colors'>;
