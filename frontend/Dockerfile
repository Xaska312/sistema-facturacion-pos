# Imagen de producción del frontend: build de Angular + Caddy (HTTPS automático, archivos estáticos y proxy al API).
# Para desarrollo se sigue usando Dockerfile.dev (ng serve).

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/pos-hibrido-frontend/browser /srv
# Valida el Caddyfile al construir (un error de sintaxis falla aquí y no en el servidor).
RUN DOMAIN=http://localhost ACME_EMAIL=build@example.com caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 80 443 443/udp
