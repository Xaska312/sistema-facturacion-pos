import { ResolveFn, Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard, platformAdminGuard, tenantGuard } from './core/auth/auth.guards';
import { legalGuard } from './core/legal/legal.service';
import { FORBIDDEN_DATA, NOT_FOUND_DATA } from './features/errors/error-data';
import { DOCUMENT_LABEL, documentTypeFromRoute } from './features/inventory/labels';
import { unsavedChangesGuard } from './shared/unsaved-changes';

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
    // Sin guestGuard: también se llega desde "Pedir un enlace nuevo" con la sesión abierta.
    path: 'recuperar-clave',
    title: 'Recuperar contraseña',
    loadComponent: () => import('./features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    // Enlaces de los correos: funcionan con o sin sesión.
    path: 'restablecer-clave',
    title: 'Contraseña nueva',
    loadComponent: () => import('./features/auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'verificar-correo',
    title: 'Confirmar correo',
    loadComponent: () => import('./features/auth/verify-email.component').then((m) => m.VerifyEmailComponent),
  },
  {
    path: 'negocios',
    canActivate: [authGuard],
    // Los textos legales se revisan en los hijos: corre después de authGuard, cuando ya hay sesión.
    canActivateChild: [legalGuard],
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
    // Consola de plataforma (solo administradores): negocios y eventos de seguridad.
    path: 'plataforma',
    canActivate: [authGuard, platformAdminGuard],
    canActivateChild: [legalGuard],
    loadComponent: () =>
      import('./features/platform/platform-layout.component').then((m) => m.PlatformLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'negocios' },
      {
        path: 'negocios',
        title: 'Plataforma: negocios',
        loadComponent: () =>
          import('./features/platform/platform-tenants.component').then((m) => m.PlatformTenantsComponent),
      },
      {
        path: 'suscripciones',
        title: 'Plataforma: suscripciones',
        loadComponent: () =>
          import('./features/platform/platform-subscriptions.component').then((m) => m.PlatformSubscriptionsComponent),
      },
      {
        path: 'codigos',
        title: 'Plataforma: códigos de activación',
        loadComponent: () =>
          import('./features/platform/platform-codes.component').then((m) => m.PlatformCodesComponent),
      },
      {
        path: 'planes',
        title: 'Plataforma: planes',
        loadComponent: () =>
          import('./features/platform/platform-plans.component').then((m) => m.PlatformPlansComponent),
      },
      {
        path: 'seguridad',
        title: 'Plataforma: eventos de seguridad',
        loadComponent: () =>
          import('./features/platform/platform-events.component').then((m) => m.PlatformEventsComponent),
      },
    ],
  },
  {
    path: 'app',
    canActivate: [authGuard, tenantGuard],
    canActivateChild: [legalGuard],
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
        path: 'auditoria',
        title: 'Auditoría',
        canActivate: [permissionGuard],
        data: { permission: 'audit:read' },
        loadComponent: () => import('./features/audit/audit.component').then((m) => m.AuditComponent),
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
        path: 'productos/modelos',
        title: 'Productos con tallas',
        canActivate: [permissionGuard],
        data: { permission: 'products:read', module: 'module:variants' },
        loadComponent: () =>
          import('./features/products/models/product-models.component').then((m) => m.ProductModelsComponent),
      },
      {
        path: 'productos/modelos/nuevo',
        title: 'Nuevo modelo con tallas',
        canActivate: [permissionGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { permission: 'products:manage', module: 'module:variants' },
        loadComponent: () =>
          import('./features/products/models/product-model-editor.component').then((m) => m.ProductModelEditorComponent),
      },
      {
        path: 'productos/modelos/:id',
        title: 'Modelo con tallas',
        canActivate: [permissionGuard],
        canDeactivate: [unsavedChangesGuard],
        // Abierto aunque Tallas y colores esté apagado: las tallas que ya hay se siguen editando aquí (Fase 12a).
        data: { permission: 'products:read' },
        loadComponent: () =>
          import('./features/products/models/product-model-editor.component').then((m) => m.ProductModelEditorComponent),
      },
      {
        path: 'productos/tallas',
        title: 'Escalas de tallas',
        canActivate: [permissionGuard],
        data: { permission: 'products:read', module: 'module:variants' },
        loadComponent: () =>
          import('./features/products/models/size-scales.component').then((m) => m.SizeScalesComponent),
      },
      {
        path: 'bascula',
        title: 'Báscula',
        canActivate: [permissionGuard],
        data: { permission: 'products:read', module: 'module:scale' },
        loadComponent: () => import('./features/scale/scale.component').then((m) => m.ScaleComponent),
      },
      {
        path: 'productos/nuevo',
        title: 'Nuevo producto',
        canActivate: [permissionGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { permission: 'products:manage' },
        loadComponent: () =>
          import('./features/products/product-editor.component').then((m) => m.ProductEditorComponent),
      },
      {
        path: 'productos/:id',
        title: 'Producto',
        canActivate: [permissionGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { permission: 'products:read' },
        loadComponent: () =>
          import('./features/products/product-editor.component').then((m) => m.ProductEditorComponent),
      },
      {
        // Mesas y cuentas abiertas (Fase 12b-2): solo con el módulo encendido.
        path: 'mesas',
        title: 'Mesas',
        canActivate: [permissionGuard],
        data: { permission: 'tables:operate', module: 'module:tables' },
        loadComponent: () => import('./features/dining/floor.component').then((m) => m.FloorComponent),
      },
      {
        path: 'mesas/configurar',
        title: 'Configurar mesas',
        canActivate: [permissionGuard],
        data: { permission: 'tables:manage', module: 'module:tables' },
        loadComponent: () => import('./features/dining/dining-setup.component').then((m) => m.DiningSetupComponent),
      },
      {
        path: 'mesas/cuenta/:id',
        title: 'Cuenta',
        canActivate: [permissionGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { permission: 'tables:operate', module: 'module:tables' },
        loadComponent: () => import('./features/dining/tab.component').then((m) => m.TabComponent),
      },
      {
        // Cocina y comandas (Fase 12b-3): solo con el módulo encendido.
        path: 'comandas',
        title: 'Comandas',
        canActivate: [permissionGuard],
        data: { permission: 'kitchen:send', module: 'module:kitchen' },
        loadComponent: () => import('./features/kitchen/tickets.component').then((m) => m.TicketsComponent),
      },
      {
        path: 'comandas/estaciones',
        title: 'Estaciones de cocina',
        canActivate: [permissionGuard],
        data: { permission: 'kitchen:manage', module: 'module:kitchen' },
        loadComponent: () => import('./features/kitchen/stations.component').then((m) => m.StationsComponent),
      },
      {
        // Adiciones (Fase 12b-1): solo con el módulo encendido.
        path: 'adiciones',
        title: 'Adiciones',
        canActivate: [permissionGuard],
        data: { permission: 'products:read', module: 'module:modifiers' },
        loadComponent: () => import('./features/modifiers/modifiers.component').then((m) => m.ModifiersComponent),
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
        canDeactivate: [unsavedChangesGuard],
        data: { permission: 'inventory:read' },
        loadComponent: () =>
          import('./features/inventory/document-editor.component').then((m) => m.InventoryDocumentEditorComponent),
      },
      {
        path: 'fiados',
        title: 'Fiados',
        canActivate: [permissionGuard],
        data: { permission: 'credit:read' },
        loadComponent: () => import('./features/credit/credit.component').then((m) => m.CreditComponent),
      },
      {
        path: 'fiados/:customerId',
        title: 'Fiado del cliente',
        canActivate: [permissionGuard],
        data: { permission: 'credit:read' },
        loadComponent: () =>
          import('./features/credit/credit-account.component').then((m) => m.CreditAccountComponent),
      },
      {
        path: 'todo',
        title: 'Todo',
        loadComponent: () => import('./features/shell/all-modules.component').then((m) => m.AllModulesComponent),
      },
      {
        path: 'pedidos',
        title: 'Pedidos',
        canActivate: [permissionGuard],
        data: { permission: 'orders:read' },
        loadComponent: () => import('./features/orders/orders.component').then((m) => m.OrdersComponent),
      },
      {
        path: 'pedidos/nuevo',
        title: 'Nuevo pedido',
        canActivate: [permissionGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { permission: 'orders:create' },
        loadComponent: () => import('./features/orders/order-editor.component').then((m) => m.OrderEditorComponent),
      },
      {
        path: 'pedidos/:id/editar',
        title: 'Editar pedido',
        canActivate: [permissionGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { permission: 'orders:create' },
        loadComponent: () => import('./features/orders/order-editor.component').then((m) => m.OrderEditorComponent),
      },
      {
        path: 'pedidos/:id',
        title: 'Pedido',
        canActivate: [permissionGuard],
        data: { permission: 'orders:read' },
        loadComponent: () => import('./features/orders/order-detail.component').then((m) => m.OrderDetailComponent),
      },
      {
        path: 'cotizaciones',
        title: 'Cotizaciones',
        canActivate: [permissionGuard],
        data: { permission: 'quotes:read' },
        loadComponent: () => import('./features/quotes/quotes.component').then((m) => m.QuotesComponent),
      },
      {
        path: 'cotizaciones/nueva',
        title: 'Nueva cotización',
        canActivate: [permissionGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { permission: 'quotes:create' },
        loadComponent: () => import('./features/quotes/quote-editor.component').then((m) => m.QuoteEditorComponent),
      },
      {
        path: 'cotizaciones/:id/editar',
        title: 'Editar cotización',
        canActivate: [permissionGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { permission: 'quotes:create' },
        loadComponent: () => import('./features/quotes/quote-editor.component').then((m) => m.QuoteEditorComponent),
      },
      {
        path: 'cotizaciones/:id',
        title: 'Cotización',
        canActivate: [permissionGuard],
        data: { permission: 'quotes:read' },
        loadComponent: () => import('./features/quotes/quote-detail.component').then((m) => m.QuoteDetailComponent),
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
    canActivate: [authGuard, tenantGuard],
    canActivateChild: [legalGuard],
    children: [
      {
        path: '',
        title: 'Vender',
        canActivate: [permissionGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { permission: 'sales:create' },
        loadComponent: () => import('./features/pos/pos.component').then((m) => m.PosComponent),
      },
    ],
  },
  {
    // Manual de uso público (con o sin sesión): se comparte con clientes, p. ej. /manual#cobrar.
    path: 'manual',
    title: 'Manual de uso',
    loadComponent: () => import('./features/manual/manual.component').then((m) => m.ManualComponent),
  },
  {
    // Términos y Política de datos (fase 9a): públicas, con o sin sesión.
    path: 'terminos',
    title: 'Términos y condiciones',
    data: { legal: 'terminos' },
    loadComponent: () => import('./features/legal/legal-page.component').then((m) => m.LegalPageComponent),
  },
  {
    path: 'privacidad',
    title: 'Política de datos',
    data: { legal: 'privacidad' },
    loadComponent: () => import('./features/legal/legal-page.component').then((m) => m.LegalPageComponent),
  },
  {
    // Cuentas que aún no aceptaron los textos vigentes (legalGuard las trae aquí).
    path: 'aceptar-terminos',
    title: 'Aceptar términos',
    canActivate: [authGuard],
    loadComponent: () => import('./features/legal/accept-legal.component').then((m) => m.AcceptLegalComponent),
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
