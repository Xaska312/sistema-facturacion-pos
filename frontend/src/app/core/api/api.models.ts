/** Modelos de la API (espejo de los DTO del backend). */

export type BusinessType = 'RETAIL' | 'PHARMACY' | 'RESTAURANT' | 'SERVICES';
export type TenantStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'FAILED';

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  platformAdmin: boolean;
}

export interface TenantSummary {
  id: string;
  slug: string;
  legalName: string;
  tradeName: string;
  businessType: BusinessType;
  status: TenantStatus;
  owner: boolean;
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
