import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard, tenantGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'registro',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'negocios',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/tenants/select-tenant.component').then((m) => m.SelectTenantComponent),
      },
      {
        path: 'nuevo',
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
        loadComponent: () => import('./features/shell/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'sucursales',
        canActivate: [permissionGuard],
        data: { permission: 'branches:read' },
        loadComponent: () => import('./features/branches/branches.component').then((m) => m.BranchesComponent),
      },
      {
        path: 'cajas',
        canActivate: [permissionGuard],
        data: { permission: 'cash-registers:manage' },
        loadComponent: () =>
          import('./features/cash-registers/cash-registers.component').then((m) => m.CashRegistersComponent),
      },
      {
        path: 'usuarios',
        canActivate: [permissionGuard],
        data: { permission: 'members:read' },
        loadComponent: () => import('./features/members/members.component').then((m) => m.MembersComponent),
      },
      {
        path: 'roles',
        canActivate: [permissionGuard],
        data: { permission: 'roles:manage' },
        loadComponent: () => import('./features/roles/roles.component').then((m) => m.RolesComponent),
      },
      {
        path: 'ajustes',
        canActivate: [permissionGuard],
        data: { permission: 'settings:read' },
        loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
  {
    // Enlace público de invitación (con o sin sesión).
    path: 'invitacion/:token',
    loadComponent: () =>
      import('./features/invitations/accept-invitation.component').then((m) => m.AcceptInvitationComponent),
  },
  { path: '**', redirectTo: 'app' },
];
