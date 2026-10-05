import { ResolveFn, Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard, tenantGuard } from './core/auth/auth.guards';
import { FORBIDDEN_DATA, NOT_FOUND_DATA } from './features/errors/error-data';
import { DOCUMENT_LABEL, documentTypeFromRoute } from './features/inventory/labels';

const errorPage = () => import('./features/errors/error-page.component').then((m) => m.ErrorPageComponent);

/** Título de la pestaña del editor de documentos de inventario según el tipo (Ajuste, Traslado…). */
export const inventoryDocumentTitle: ResolveFn<string> = (route) => {
  const type = documentTypeFromRoute(route.paramMap.get('kind') ?? '');
  return type ? DOCUMENT_LABEL[type] : 'Documento de inventario';
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  {
    path: 'login',
    title: 'Iniciar sesión',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'registro',
    title: 'Crear cuenta',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'negocios',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        title: 'Elegir negocio',
        loadComponent: () =>
          import('./features/tenants/select-tenant.component').then((m) => m.SelectTenantComponent),
      },
      {
        path: 'nuevo',
        title: 'Nuevo negocio',
        loadComponent: () =>
          import('./features/tenants/create-tenant.component').then((m) => m.CreateTenantComponent),
      },
    ],
  },
  {
    path: 'app',
    canActivate: [authGuard, tenantGuard],
    loadComponent: () => import('./features/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        title: 'Inicio',
        loadComponent: () => import('./features/shell/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'caja',
        title: 'Mi caja',
        canActivate: [permissionGuard],
        data: { permission: 'cash:operate' },
        loadComponent: () => import('./features/cash/cash.component').then((m) => m.CashComponent),
      },
      {
        path: 'caja/historial',
        title: 'Historial de caja',
        canActivate: [permissionGuard],
        data: { permission: 'cash:read' },
        loadComponent: () => import('./features/cash/cash-history.component').then((m) => m.CashHistoryComponent),
      },
      {
        path: 'ventas',
        title: 'Ventas',
        canActivate: [permissionGuard],
        data: { permission: 'sales:read' },
        loadComponent: () => import('./features/sales/sales.component').then((m) => m.SalesComponent),
      },
      {
        path: 'reportes',
        title: 'Reportes',
        canActivate: [permissionGuard],
        data: { permission: 'reports:read' },
        loadComponent: () => import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'productos',
        title: 'Productos',
        canActivate: [permissionGuard],
        data: { permission: 'products:read' },
        loadComponent: () => import('./features/products/products.component').then((m) => m.ProductsComponent),
      },
      {
        path: 'productos/importar',
        title: 'Importar productos',
        canActivate: [permissionGuard],
        data: { permission: 'products:manage' },
        loadComponent: () =>
          import('./features/products/product-import.component').then((m) => m.ProductImportComponent),
      },
      {
        path: 'productos/nuevo',
        title: 'Nuevo producto',
        canActivate: [permissionGuard],
        data: { permission: 'products:manage' },
        loadComponent: () =>
          import('./features/products/product-editor.component').then((m) => m.ProductEditorComponent),
      },
      {
        path: 'productos/:id',
        title: 'Producto',
        canActivate: [permissionGuard],
        data: { permission: 'products:read' },
        loadComponent: () =>
          import('./features/products/product-editor.component').then((m) => m.ProductEditorComponent),
      },
      {
        path: 'catalogo',
        title: 'Ajustes de catálogo',
        canActivate: [permissionGuard],
        data: { permission: 'products:manage' },
        loadComponent: () =>
          import('./features/catalog-settings/catalog-settings.component').then((m) => m.CatalogSettingsComponent),
      },
      {
        path: 'inventario',
        title: 'Existencias',
        canActivate: [permissionGuard],
        data: { permission: 'inventory:read' },
        loadComponent: () => import('./features/inventory/stock.component').then((m) => m.StockComponent),
      },
      {
        path: 'inventario/movimientos',
        title: 'Movimientos',
        canActivate: [permissionGuard],
        data: { permission: 'inventory:read' },
        loadComponent: () =>
          import('./features/inventory/documents.component').then((m) => m.InventoryDocumentsComponent),
      },
      {
        path: 'inventario/kardex/:productId',
        title: 'Kardex',
        canActivate: [permissionGuard],
        data: { permission: 'inventory:read' },
        loadComponent: () => import('./features/inventory/kardex.component').then((m) => m.KardexComponent),
      },
      {
        // Saldo inicial, ajuste y conteo requieren inventory:adjust; el traslado, inventory:transfer
        // (el backend valida cada uno; aquí basta con poder ver el inventario).
        path: 'inventario/nuevo/:kind',
        title: inventoryDocumentTitle,
        canActivate: [permissionGuard],
        data: { permission: 'inventory:read' },
        loadComponent: () =>
          import('./features/inventory/document-editor.component').then((m) => m.InventoryDocumentEditorComponent),
      },
      {
        path: 'clientes',
        title: 'Clientes',
        canActivate: [permissionGuard],
        data: { permission: 'parties:read', kind: 'customers' },
        loadComponent: () => import('./features/parties/parties.component').then((m) => m.PartiesComponent),
      },
      {
        path: 'proveedores',
        title: 'Proveedores',
        canActivate: [permissionGuard],
        data: { permission: 'parties:read', kind: 'suppliers' },
        loadComponent: () => import('./features/parties/parties.component').then((m) => m.PartiesComponent),
      },
      {
        path: 'sucursales',
        title: 'Sucursales',
        canActivate: [permissionGuard],
        data: { permission: 'branches:read' },
        loadComponent: () => import('./features/branches/branches.component').then((m) => m.BranchesComponent),
      },
      {
        path: 'cajas',
        title: 'Cajas',
        canActivate: [permissionGuard],
        data: { permission: 'cash-registers:manage' },
        loadComponent: () =>
          import('./features/cash-registers/cash-registers.component').then((m) => m.CashRegistersComponent),
      },
      {
        path: 'usuarios',
        title: 'Usuarios',
        canActivate: [permissionGuard],
        data: { permission: 'members:read' },
        loadComponent: () => import('./features/members/members.component').then((m) => m.MembersComponent),
      },
      {
        path: 'roles',
        title: 'Roles y permisos',
        canActivate: [permissionGuard],
        data: { permission: 'roles:manage' },
        loadComponent: () => import('./features/roles/roles.component').then((m) => m.RolesComponent),
      },
      {
        path: 'ajustes',
        title: 'Ajustes',
        canActivate: [permissionGuard],
        data: { permission: 'settings:read' },
        loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'sin-permiso',
        title: 'Sin permiso',
        data: FORBIDDEN_DATA,
        loadComponent: errorPage,
      },
      { path: '**', title: 'Página no encontrada', data: NOT_FOUND_DATA, loadComponent: errorPage },
    ],
  },
  {
    // Pantalla de venta a pantalla completa (sin menú lateral), pensada también para tablet horizontal.
    path: 'pos',
    title: 'Vender',
    canActivate: [authGuard, tenantGuard, permissionGuard],
    data: { permission: 'sales:create' },
    loadComponent: () => import('./features/pos/pos.component').then((m) => m.PosComponent),
  },
  {
    // Enlace público de invitación (con o sin sesión).
    path: 'invitacion/:token',
    title: 'Invitación',
    loadComponent: () =>
      import('./features/invitations/accept-invitation.component').then((m) => m.AcceptInvitationComponent),
  },
  {
    path: '**',
    title: 'Página no encontrada',
    data: { ...NOT_FOUND_DATA, standalone: true },
    loadComponent: errorPage,
  },
];
