# Despliegue en producción (Hetzner + Docker)

Guía paso a paso para poner el POS en un servidor propio con HTTPS, respaldos diarios cifrados en Google Drive y
prueba de restauración automática. Tiempo estimado la primera vez: 1–2 horas.

## Cómo queda armado

```
Internet ──443/80──▶ web (Caddy) ──▶ /api/*  ─▶ backend (Spring Boot) ─▶ postgres-db (PostgreSQL 16)
                      │  HTTPS automático              ▲                        ▲
                      └─ app Angular (archivos)        │                        │
                                                       └── red interna ── backup (pg_dump → rclone cifrado → Google Drive)
```

- Un solo servidor con `docker compose` (`deploy/docker-compose.prod.yml`). Solo Caddy publica puertos (80 y 443).
- Las imágenes se construyen en GitHub Actions (`.github/workflows/images.yml`) y el servidor solo las descarga.
- PostgreSQL usa dos usuarios: un superusuario para respaldos/administración y el de la app, sin privilegios de
  superusuario (`deploy/postgres/initdb/01-app-user.sh`).
- Respaldo diario (3:30 a. m.) de toda la base, verificado y subido cifrado a tu Google Drive; 7 copias en el
  servidor, 30 días de diarios y ~13 meses de mensuales en la nube. Cada domingo se restaura el último respaldo en
  una base aparte y se revisa (negocios, schemas, productos, ventas).

## Lo que necesitas

| Qué | Costo aproximado |
|---|---|
| Servidor Hetzner **CX23** (2 vCPU, 4 GB, 40 GB) — o **CAX11** (ARM, 4 GB) si el CX23 está agotado | ~€6/mes |
| Dominio (p. ej. `.com` o `.co`) | US$10–40/año |
| Google Drive (tu plan de 5 TB) | ya lo pagas |
| Resend (correos, Fase 7-4) y healthchecks.io / UptimeRobot (monitoreo) | plan gratis |

No uses planes de 1 GB de RAM: Java + PostgreSQL + Caddy no caben con margen.

---

## 1. Crear el servidor en Hetzner

1. En tu PC (PowerShell), crea una llave SSH si no tienes una:
   ```powershell
   ssh-keygen -t ed25519 -C "pos-hibrido"
   Get-Content $HOME\.ssh\id_ed25519.pub     # copia esta línea
   ```
2. En [Hetzner Cloud Console](https://console.hetzner.cloud): *New project* → *Add server*:
   - **Location**: Nuremberg, Falkenstein o Helsinki (o Ashburn, EE. UU., si el plan está disponible ahí: menos
     latencia desde Colombia).
   - **Image**: Ubuntu 24.04.
   - **Type**: *Shared vCPU* → **CX23** (x86) o **CAX11** (Arm64). Las imágenes sirven para los dos.
   - **Networking**: IPv4 (+ IPv6 si quieres, pero sin registro AAAA en el dominio; ver paso 2).
   - **SSH keys**: pega la llave pública del paso 1 (así no hay contraseña de root).
   - **Firewalls**: crea uno con estas reglas de entrada: TCP 22 (ideal: solo tu IP), TCP 80, TCP 443, UDP 443.
   - **Backups** (opcional, +20 %): copia de todo el disco cada día. Es una capa extra; los respaldos de la base
     de datos de esta guía son los que importan.
3. Anota la **IP pública** del servidor.

## 2. Apuntar el dominio

En el panel de tu dominio crea un registro **A**: nombre `pos` (o `@` para el dominio raíz) → IP del servidor.
**No crees un registro AAAA (IPv6)**: la red de Docker de esta instalación es solo IPv4, y las conexiones por
IPv6 llegarían al backend todas con la misma IP interna (un solo límite de intentos de login para todos y
auditoría sin la IP real). Los celulares con IPv6 llegan igual por IPv4. Comprueba desde PowerShell (puede tardar
unos minutos):

```powershell
Resolve-DnsName pos.midominio.com
```

## 3. Preparar el servidor

Conéctate como root (solo esta vez):

```powershell
ssh root@IP_DEL_SERVIDOR
```

```bash
# Actualizaciones, actualizaciones automáticas de seguridad y fail2ban (bloquea intentos de SSH por fuerza bruta)
apt update && apt -y upgrade
apt -y install unattended-upgrades fail2ban ufw git
dpkg-reconfigure -f noninteractive unattended-upgrades

# Usuario de trabajo con sudo y tu misma llave SSH
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
passwd deploy        # contraseña para sudo (guárdala en tu gestor de contraseñas)

# SSH: sin contraseñas y sin root. Archivo "00-": se lee antes que los demás y en SSH gana el primer valor.
printf 'PasswordAuthentication no\nPermitRootLogin no\n' > /etc/ssh/sshd_config.d/00-endurecimiento.conf
sshd -t && systemctl restart ssh

# Firewall del sistema (además del de Hetzner)
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable

# Memoria de intercambio de 2 GB (colchón para picos y actualizaciones)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf

# Docker (script oficial) y permiso para el usuario deploy
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
timedatectl set-timezone America/Bogota
```

**Antes de cerrar esta sesión**, abre otra terminal y comprueba que entras como `deploy`:
`ssh deploy@IP_DEL_SERVIDOR`. Desde ahora usa siempre ese usuario.

> Docker publica puertos por fuera de `ufw`. Por eso `docker-compose.prod.yml` solo publica 80 y 443:
> PostgreSQL y el backend no tienen puertos abiertos.

## 4. Publicar las imágenes

1. Fusiona la rama de la fase en `main`. Cuando el **CI** termine en verde, el flujo **Imágenes de producción**
   publica `pos-hibrido-backend`, `pos-hibrido-web` y `pos-hibrido-backup` en *GitHub → tu perfil → Packages*.
   También se puede lanzar a mano: *Actions → Imágenes de producción → Run workflow*.
2. **Versiones** (recomendado): para saber exactamente qué corre en producción, crea una etiqueta desde `main`:
   ```powershell
   git checkout main; git pull
   git tag v0.7.0; git push origin v0.7.0      # publica las imágenes con la etiqueta 0.7.0
   ```
3. **Acceso a las imágenes**: si el repositorio es privado, las imágenes también. Crea un token en
   *GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)* con solo el permiso
   `read:packages`, y en el servidor:
   ```bash
   echo TU_TOKEN | docker login ghcr.io -u Xaska312 --password-stdin
   ```

## 5. Descargar la configuración en el servidor

```bash
cd ~
git clone https://github.com/Xaska312/sistema-facturacion-pos.git      # repo privado: usuario + token con "repo"
cd sistema-facturacion-pos/deploy
cp .env.example .env && chmod 600 .env
```

Genera las claves (una por cada valor) y edita `.env`:

```bash
for i in 1 2 3; do openssl rand -base64 48 | tr -d '/+=' | cut -c1-40; done
nano .env
```

| Variable | Valor |
|---|---|
| `DOMAIN` | `pos.midominio.com` (sin `https://`) |
| `ACME_EMAIL` | tu correo (avisos de Let's Encrypt) |
| `GHCR_OWNER` | `xaska312` (en minúsculas) |
| `APP_VERSION` | `0.7.0` o `latest` |
| `POSTGRES_ADMIN_PASSWORD`, `DB_PASSWORD`, `JWT_SECRET` | las tres claves generadas (distintas) |
| `BACKUP_REMOTE` | `posdrive-crypt:` (paso 6) |
| `PLATFORM_ADMIN_EMAILS` | déjalo vacío por ahora: se llena en el paso 7, después de registrarte |
| `RESEND_API_KEY`, `MAIL_FROM` | correos de la app (sección 13). Sin clave, los enlaces quedan en el log del backend |

- **`JWT_SECRET` nuevo**: nunca el de desarrollo ni uno que se haya compartido por chat o correo.
- Evita `$` en las claves: Docker Compose lo interpreta como variable (el comando de arriba no lo genera).
- Guarda una copia de `.env` en tu gestor de contraseñas.

## 6. Respaldos en Google Drive (rclone cifrado)

Se configura **en tu PC** (necesita navegador para autorizar Google) y luego se copia al servidor.

1. Instala rclone en Windows: `winget install Rclone.Rclone` (cierra y abre PowerShell).
2. `rclone config` y crea dos remotos:

   **a) `posdrive` (acceso a tu Drive)**
   - `n` (nuevo) → nombre `posdrive` → tipo `drive` (Google Drive).
   - `client_id` y `client_secret`: Enter (vacíos).
   - `scope`: **`drive.file`** (rclone solo ve los archivos que él mismo crea; no puede leer el resto de tu Drive).
   - `service_account_file`: Enter. *Edit advanced config*: `n`. *Use web browser*: `y` → inicia sesión con la
     cuenta del plan de 5 TB y autoriza. *Shared Drive*: `n`. Confirma con `y`.

   **b) `posdrive-crypt` (cifrado encima de `posdrive`)**
   - `n` → nombre `posdrive-crypt` → tipo `crypt`.
   - `remote`: `posdrive:pos-hibrido-respaldos`
   - `filename_encryption`: `standard`; `directory_name_encryption`: `true`.
   - Contraseña: `g` (generar) → longitud 128 → **cópiala**. Segunda contraseña (salt): `g` → **cópiala**.
   - Confirma con `y` y sal con `q`.

   > **Las dos contraseñas son la única forma de leer los respaldos.** Guárdalas en tu gestor de contraseñas y en
   > un papel en un lugar seguro. Si se pierden el servidor y estas claves, los respaldos no sirven.

3. Prueba desde tu PC:
   ```powershell
   rclone mkdir posdrive-crypt:daily
   rclone lsd posdrive:pos-hibrido-respaldos     # ves una carpeta con nombre cifrado
   rclone config file                            # muestra dónde está rclone.conf
   ```
4. Copia la configuración al servidor (ajusta la ruta si `rclone config file` muestra otra):
   ```powershell
   scp "$env:APPDATA\rclone\rclone.conf" deploy@IP_DEL_SERVIDOR:~/sistema-facturacion-pos/deploy/rclone/rclone.conf
   ```
   y en el servidor: `chmod 600 ~/sistema-facturacion-pos/deploy/rclone/rclone.conf`.

`rclone.conf` tiene el acceso a la carpeta de respaldos y las claves de cifrado: no lo subas al repositorio (ya
está en `.gitignore`) ni lo compartas.

## 7. Arrancar

```bash
cd ~/sistema-facturacion-pos/deploy
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps          # todos "running"; backend "healthy" en ~1 minuto
docker compose -f docker-compose.prod.yml logs -f web # ver el certificado: "certificate obtained successfully"
```

Abre `https://pos.midominio.com`, regístrate, **confirma tu correo** con el enlace que te llega y crea tu negocio. `https://pos.midominio.com/healthz` debe
responder `{"status":"UP"}`.

**Consola de plataforma** (suspender negocios, ver eventos de seguridad): ya registrado y con el correo confirmado, pon tu correo en
`PLATFORM_ADMIN_EMAILS` del `.env` y reinicia el backend con `docker compose -f docker-compose.prod.yml up -d backend`.
Al arrancar, el backend le da el permiso a las cuentas que ya existen con esos correos (por eso va después de
registrarte: así nadie puede registrarse antes con tu correo y quedar como administrador). Vuelve a iniciar sesión y
entra a `https://pos.midominio.com/plataforma`.

Para no escribir `-f docker-compose.prod.yml` cada vez: `echo 'COMPOSE_FILE=docker-compose.prod.yml' >> .env`.
Desde aquí los comandos se escriben así: `docker compose ps`.

## 8. Primer respaldo y prueba de restauración

```bash
docker compose exec backup backup.sh            # respaldo ahora mismo (sube a Drive)
docker compose exec backup restore.sh --test    # lo restaura en una base aparte y lo revisa
docker compose exec backup restore.sh --list    # respaldos en el servidor y en la nube
docker compose logs backup                      # historial de respaldos programados
```

Debe terminar en `Respaldo terminado.` y `Prueba de restauración correcta`.

## 9. Monitoreo (gratis, recomendado)

- **Respaldos**: en [healthchecks.io](https://healthchecks.io) crea dos *checks*: "Respaldo diario" (periodo
  1 día, gracia 2 horas) y "Prueba de restauración" (periodo 7 días, gracia 6 horas). Pega sus URL en
  `BACKUP_PING_URL` y `RESTORE_TEST_PING_URL` del `.env` y aplica con `docker compose up -d`. Te llega un correo si
  un respaldo falla o deja de correr.
- **Disponibilidad**: en [UptimeRobot](https://uptimerobot.com) un monitor HTTP(s) a `https://pos.midominio.com/healthz`
  cada 5 minutos.

## 10. Actualizar a una versión nueva

```bash
cd ~/sistema-facturacion-pos && git pull          # por si cambió la configuración de despliegue
cd deploy
docker compose exec backup backup.sh              # respaldo antes de actualizar
nano .env                                         # APP_VERSION=0.8.0 (si usas versiones)
docker compose pull && docker compose up -d       # 30–60 s sin servicio mientras arranca el backend
docker compose ps && docker image prune -f
```

Las migraciones de la base (Flyway) corren solas al arrancar el backend. **Volver atrás**: pon la versión anterior
en `APP_VERSION` y `docker compose up -d`; si la versión nueva ya cambió la base, restaura el respaldo de antes de
actualizar (paso 11).

## 11. Restaurar un respaldo (emergencia)

```bash
cd ~/sistema-facturacion-pos/deploy
docker compose exec backup restore.sh --list
docker compose stop backend
docker compose exec backup restore.sh --production daily/pos_hibrido_2026-10-06T033000.dump
docker compose start backend
```

`--production` restaura en una base nueva, la revisa y solo entonces la cambia por la real. La base anterior queda
como `pos_hibrido_antes_<fecha>`; cuando confirmes que todo está bien:
`docker compose exec postgres-db dropdb -U pos_admin pos_hibrido_antes_<fecha>`.

**Servidor perdido por completo**: crea uno nuevo (pasos 1–5), copia `rclone.conf` (paso 6.4), arranca solo la base
y los respaldos (`docker compose up -d postgres-db backup`), restaura con `--production` y después
`docker compose up -d`. Sin `rclone.conf`, vuelve a crearlo con las **mismas** dos contraseñas de cifrado.

## 12. Probar el modo producción en tu PC (opcional)

Con Docker Desktop, desde la carpeta `deploy` del repositorio:

```powershell
Copy-Item .env.example .env
notepad .env    # claves de prueba y descomenta las 4 líneas del final (CADDY_SITE, puertos y CORS)
docker compose -f docker-compose.prod.yml -f docker-compose.build.yml up -d --build
```

Abre `http://localhost:8081`. Para borrar todo: `docker compose -f docker-compose.prod.yml down -v`.

Sin `RESEND_API_KEY` los correos no salen: el enlace para confirmar tu cuenta aparece en el log del backend
(descomenta también `APP_PUBLIC_URL=http://localhost:8081`):

```powershell
docker compose -f docker-compose.prod.yml logs backend | Select-String "verificar-correo"
```

## 13. Correos con Resend

La app envía correos para confirmar la cuenta, invitar usuarios, restablecer la contraseña y avisar al dueño si su
negocio se suspende. Salen por [Resend](https://resend.com) (plan gratis: 100 por día, 3.000 por mes).

1. Crea la cuenta en resend.com con tu correo.
2. **Domains → Add Domain** → `midominio.com` (o un subdominio, p. ej. `correo.midominio.com`). Región: la que
   sugiera (us-east-1 está bien).
3. Resend muestra 3 o 4 registros DNS (SPF `TXT`/`MX` en `send…` y DKIM `TXT` en `resend._domainkey…`). Créalos en el
   panel DNS de donde compraste el dominio, copiándolos tal cual, y pulsa **Verify**. Suele tardar minutos (hasta
   24 h). Recomendado además un registro DMARC: `TXT` en `_dmarc` con `v=DMARC1; p=none;`.
4. **API Keys → Create API Key** → permiso *Sending access*, solo para ese dominio. Cópiala (se muestra una vez).
5. En el `.env` del servidor:
   ```bash
   RESEND_API_KEY=re_xxxxxxxx
   MAIL_FROM=POS Híbrido <no-responder@midominio.com>
   ```
6. `docker compose up -d backend` y revisa: `docker compose logs backend | grep "Correos:"` debe decir
   `Correos: Resend`. Prueba con "¿Olvidaste tu contraseña?" en tu cuenta.

- Mientras el dominio no esté verificado, Resend solo acepta `MAIL_FROM` con `onboarding@resend.dev` y **solo
  entrega a tu propio correo** (el de la cuenta de Resend): sirve para probar, no para clientes.
- La clave va solo en `.env` (nunca en el repositorio ni por chat). Si se filtra, bórrala en Resend y crea otra.
- En **Emails** de Resend ves cada correo enviado, entregado o rebotado. Si alguien no recibe la invitación, el
  dueño puede copiar el enlace que aparece al invitar y mandarlo por WhatsApp.

## Lista de seguridad antes de abrir a clientes

- [ ] `JWT_SECRET`, `DB_PASSWORD` y `POSTGRES_ADMIN_PASSWORD` nuevos y distintos; `.env` con permisos 600.
- [ ] SSH solo con llave, sin root (paso 3); firewall de Hetzner y `ufw` con 22/80/443.
- [ ] `https://` con candado; `http://` redirige a `https://`.
- [ ] Primer respaldo en Drive y prueba de restauración correcta; contraseñas de cifrado guardadas fuera del servidor.
- [ ] Monitores de healthchecks.io y UptimeRobot activos.
- [ ] Dominio verificado en Resend y `MAIL_FROM` con ese dominio; un correo de prueba llega a la bandeja (no a spam).
- [ ] Swagger apagado (`OPENAPI_ENABLED=false`, ya fijo en producción) y `/actuator` no accesible desde internet
      (solo `/healthz`).

## Problemas comunes

| Síntoma | Causa probable y solución |
|---|---|
| El navegador dice que el certificado no es válido | El DNS aún no apunta al servidor o el puerto 80/443 está cerrado. `docker compose logs web`, revisa el firewall de Hetzner y `Resolve-DnsName`. Caddy reintenta solo. |
| `502` en `/api` justo después de actualizar | El backend está arrancando (hasta 1 minuto). `docker compose ps` hasta ver `healthy`. |
| El backend se reinicia solo | Memoria. `docker compose logs backend` y `free -h`. Revisa que exista la swap (paso 3). |
| `denied` al descargar imágenes | Falta `docker login ghcr.io` (paso 4.3) o el token no tiene `read:packages`. |
| Respaldos sin subir a Drive | `docker compose logs backup`. Falta `rclone/rclone.conf` o `BACKUP_REMOTE`, o el acceso a Google se revocó (vuelve a hacer el paso 6 con las mismas contraseñas de cifrado). |
| Disco lleno | `df -h`, `docker system df`; `docker image prune -a` borra imágenes viejas. |
