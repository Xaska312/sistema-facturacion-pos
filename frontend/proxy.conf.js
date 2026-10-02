// Proxy del servidor de desarrollo: el navegador habla solo con localhost:4200,
// así la cookie de refresh (SameSite=Strict) funciona sin CORS.
module.exports = {
  '/api': {
    target: process.env.API_TARGET || 'http://localhost:8080',
    secure: false,
    changeOrigin: false,
  },
};
