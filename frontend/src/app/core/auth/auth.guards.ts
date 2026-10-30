import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';
import { returnQuery } from './return-url';

/** Hay sesión (o se puede recuperar con la cookie de refresh). Sin ella, al login recordando la página pedida. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) {
    return true;
  }
  return auth.restore().pipe(
    map((ok) => (ok ? true : router.createUrlTree(['/login'], { queryParams: returnQuery(state.url) }))),
  );
};

/** La sesión corresponde a un negocio (token con tid). Si no, a elegirlo y luego volver a la página pedida. */
export const tenantGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.hasTenant() ? true : inject(Router).createUrlTree(['/negocios'], { queryParams: returnQuery(state.url) });
};

/**
 * Exige el permiso indicado en {@code data.permission} de la ruta y, si la pantalla es de un módulo que se puede
 * apagar (Fase 12a), su autoridad en {@code data.module} (p. ej. "module:variants"). Sin ellos, "sin permiso".
 */
export const permissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const permission = route.data['permission'] as string | undefined;
  const module = route.data['module'] as string | undefined;
  if ((!permission || auth.hasPermission(permission)) && (!module || auth.hasPermission(module))) {
    return true;
  }
  return inject(Router).createUrlTree(['/app/sin-permiso']);
};

/** Consola de plataforma: solo administradores (claim padm). El backend lo vuelve a exigir en cada petición. */
export const platformAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isPlatformAdmin() ? true : inject(Router).createUrlTree(['/negocios']);
};

/** Para login/registro: si ya hay sesión, no mostrar el formulario. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (!auth.isAuthenticated()) {
    return true;
  }
  return inject(Router).createUrlTree([auth.hasTenant() ? '/app' : '/negocios']);
};
