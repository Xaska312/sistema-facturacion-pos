// Aplica el modo oscuro antes del primer render (sin parpadeo). Debe coincidir con ThemeService.
// Va en un archivo aparte (no en línea en index.html) para que la política de seguridad (CSP) no permita
// scripts en línea.
(function () {
  try {
    var mode = localStorage.getItem('pos.theme');
    var system = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (mode === 'dark' || (mode !== 'light' && system)) {
      document.documentElement.classList.add('app-dark');
    }
  } catch (e) {
    // Sin almacenamiento: se queda en claro hasta que arranque la app.
  }
})();
