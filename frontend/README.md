# Frontend — POS Híbrido

Angular 19 (standalone, signals, interceptores funcionales) + PrimeNG 19 (tema Aura) + Tailwind 4.

```bash
npm install
npm start          # http://localhost:4200, proxy /api -> http://localhost:8080 (API_TARGET para cambiarlo)
npm run build
npm run test:ci
```

- `core/auth`: `AuthService` (access token solo en memoria), `authInterceptor` (Bearer + refresh único con cola),
  guards `authGuard`, `tenantGuard`, `permissionGuard`, `guestGuard`.
- `core/errors`: toast global a partir de `ProblemDetail`.
- `shared/has-permission.directive.ts`: `*hasPermission="'sales:void'"`.
- `features/`: login, registro, selección y creación de negocio, shell con menú por permisos, sucursales.
