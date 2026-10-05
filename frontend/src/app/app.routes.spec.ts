import { ActivatedRouteSnapshot, Route, RouterStateSnapshot, convertToParamMap } from '@angular/router';
import { inventoryDocumentTitle, routes } from './app.routes';

function allRoutes(list: Route[]): Route[] {
  return list.flatMap((route) => [route, ...allRoutes(route.children ?? [])]);
}

describe('routes', () => {
  it('toda pantalla tiene título de pestaña', () => {
    const screens = allRoutes(routes).filter((r) => r.loadComponent && !r.children);
    const missing = screens.filter((r) => !r.title).map((r) => r.path);
    expect(missing).toEqual([]);
  });

  it('las rutas desconocidas muestran la página 404 (dentro y fuera del menú)', () => {
    const notFound = allRoutes(routes).filter((r) => r.path === '**');
    expect(notFound.length).toBe(2);
    expect(notFound.every((r) => r.data?.['code'] === '404')).toBeTrue();
  });

  it('el título del editor de inventario depende del tipo de documento', () => {
    const snapshot = (kind: string) => ({ paramMap: convertToParamMap({ kind }) }) as ActivatedRouteSnapshot;
    const state = {} as RouterStateSnapshot;
    expect(inventoryDocumentTitle(snapshot('traslado'), state)).toBe('Traslado');
    expect(inventoryDocumentTitle(snapshot('otro'), state)).toBe('Documento de inventario');
  });
});
