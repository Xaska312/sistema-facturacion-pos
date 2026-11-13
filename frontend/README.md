# Frontend — XASKA POS

Angular 21 (standalone, signals, interceptores funcionales) + componentes propios en `src/app/shared/ui` sobre `@angular/cdk`
(decisiones 335–341; ver su `README.md`) + Tailwind 4. Íconos: PrimeIcons (MIT). Node 24.
En producción la app queda guardada en el equipo con `@angular/service-worker` (`ngsw-config.json`, decisión 333); en
desarrollo (`npm start`) no se usa.

```bash
npm install
npm start          # http://localhost:4200, proxy /api -> http://localhost:8080 (API_TARGET para cambiarlo)
npm run build
npm run test:ci
```

- `core/auth`: `AuthService` (access token solo en memoria), `authInterceptor` (Bearer + refresh único con cola),
  guards `authGuard`, `tenantGuard`, `permissionGuard`, `guestGuard`.
- `core/errors`: toast global a partir de `ProblemDetail`.
- `core/offline`: vender sin internet (decisiones 332–333): copia del catálogo y cola de ventas en IndexedDB
  (`OfflineCatalogService`, `OfflineSalesService`) y la caja recordada para abrir sin conexión (`offline-boot.ts`).
- `core/printing`: tiquete ESC/POS para XASKA Impresora; `shared/receipt`: tiquete en pantalla, sus renglones para la
  imagen (`receipt-rows.ts`) y el encabezado libre (`doc-header.ts`).
- `shared/has-permission.directive.ts`: `*hasPermission="'sales:void'"`.
- `features/`: una carpeta por pantalla o módulo (Vender, caja, inventario, compras, finanzas, Aska, plataforma…).
