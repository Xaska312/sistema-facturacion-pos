/** Textos de las páginas de error; van en el {@code data} de la ruta (se enlazan como inputs). */

/** Datos de ruta para la página 404. */
export const NOT_FOUND_DATA = {
  code: '404',
  heading: 'No encontramos esta página',
  message: 'Puede que el enlace esté mal escrito o que la página ya no exista.',
  icon: 'pi pi-compass',
};

/** Datos de ruta para la página "sin permiso" (403). */
export const FORBIDDEN_DATA = {
  code: '403',
  heading: 'No tienes permiso para ver esto',
  message: 'Tu rol en este negocio no incluye esta opción. Si la necesitas, pídele acceso al administrador.',
  icon: 'pi pi-lock',
};
