# Imagen de producción del frontend: build de Angular + Caddy (HTTPS automático, archivos estáticos y proxy al API).
# Para desarrollo se sigue usando Dockerfile.dev (ng serve).

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# XASKA Impresora (decisión 286): el programa de Windows que imprime directo en la térmica; se descarga desde la app.
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS agent
WORKDIR /agent
COPY print-agent/ ./
RUN go test ./... && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H windowsgui -s -w" -o XASKA-Impresora.exe .

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/pos-hibrido-frontend/browser /srv
COPY --from=agent /agent/XASKA-Impresora.exe /srv/descargas/XASKA-Impresora.exe
# Valida el Caddyfile al construir (un error de sintaxis falla aquí y no en el servidor).
RUN DOMAIN=http://localhost ACME_EMAIL=build@example.com caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 80 443 443/udp
