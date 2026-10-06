# Guía de desarrollo: ver la app por dentro

Tres herramientas distintas que conviene no confundir:

| Qué | Para qué | Dónde |
|---|---|---|
| **Consola de plataforma** | Administrar el SaaS: negocios de todos los dueños, suspender/reactivar, eventos de seguridad | `http://localhost:4200/plataforma` (pantalla de la app) |
| **Base de datos** (pgAdmin, DBeaver o psql) | Mirar tablas y datos como ingeniero | PostgreSQL en `localhost:5432` |
| **Backend** (logs, Swagger, salud) | Ver qué hace la API, probar endpoints, diagnosticar errores | `docker compose logs`, `http://localhost:8080` |

## 1. Consola de plataforma

Es una pantalla web de la app, no una herramienta de base de datos. Solo la ven los administradores de plataforma.

1. Regístrate en la app con tu cuenta (si aún no existe).
2. En el `.env` de la raíz: `PLATFORM_ADMIN_EMAILS=tu-correo@ejemplo.com` (el mismo correo de la cuenta).
3. Reconstruye/reinicia el backend: `docker compose up -d --build backend`.
4. En los logs debe aparecer `Administradores de plataforma: 1 configurados…`:
   ```powershell
   docker compose logs backend | Select-String "Administradores de plataforma|PLATFORM_ADMIN_EMAILS"
   ```
   Si dice "correos sin cuenta", el correo del `.env` no coincide con ninguna cuenta registrada.
5. **Sal de la app y vuelve a iniciar sesión** (el permiso viaja en el token). En "Elegir negocio" aparece
   "Consola de plataforma" debajo de "+ Crear un negocio", y también en el menú de usuario dentro de un negocio.

Por qué así: el permiso se aplica al arrancar y solo a cuentas que ya existen, para que nadie pueda registrarse
antes con tu correo y quedar como administrador (decisión 179).

## 2. Base de datos

### Conectarse con pgAdmin 4 (o DBeaver)

Con `docker compose up` corriendo:

1. pgAdmin → clic derecho en **Servers** → **Register → Server…**
2. **General** → Name: `POS local`
3. **Connection**:
   - Host: `localhost` · Port: `5432` · Maintenance database: `pos_hibrido`
   - Username / Password: `DB_USER` y `DB_PASSWORD` del `.env` de la raíz.
4. Save. Si no conecta, revisa que no haya otro PostgreSQL instalado en Windows usando el puerto 5432.

En DBeaver es igual: *Nueva conexión → PostgreSQL* con los mismos datos (marca "Show all databases" si quieres
ver también `postgres`).

### Sin instalar nada (psql dentro del contenedor)

```powershell
docker compose exec postgres-db psql -U pos_user -d pos_hibrido   # cambia pos_user por tu DB_USER
```

| Comando | Qué hace |
|---|---|
| `\dn` | Lista los schemas |
| `\dt platform.*` | Tablas de la plataforma |
| `\dt t_tienda_demo.*` | Tablas de un negocio |
| `\d t_tienda_demo.products` | Columnas de una tabla |
| `\x` | Alterna vista vertical (útil con filas anchas) |
| `\q` | Salir |

### Cómo está organizada

| Schema | Contenido |
|---|---|
| `platform` | Común a todos: `users`, `tenants` (negocios), `memberships`, `refresh_tokens`, `invitations`, `security_events`, `departments`/`cities`, historial de Flyway |
| `t_<identificador>` | Un schema por negocio (`t_tienda_demo`…): `products`, `categories`, `customers`, `suppliers`, `sales`, `sale_items`, `sale_payments`, `cash_sessions`, `cash_movements`, `stock_balances`, `stock_movements`, `inventory_documents`, `roles`, `members`, `audit_log`, `business_settings`… |

El identificador de cada negocio está en `platform.tenants.schema_name`.

Consultas útiles:

```sql
-- Negocios y su estado
SELECT slug, trade_name, status, schema_name FROM platform.tenants ORDER BY created_at;

-- Últimas ventas de un negocio
SELECT prefix || '-' || number AS venta, status, total, customer_name, created_at
FROM t_tienda_demo.sales ORDER BY created_at DESC LIMIT 10;

-- Existencias por producto y sucursal
SELECT br.name AS sucursal, p.sku, p.name, b.quantity
FROM t_tienda_demo.stock_balances b
JOIN t_tienda_demo.products p ON p.id = b.product_id
JOIN t_tienda_demo.branches br ON br.id = b.branch_id
ORDER BY br.name, p.name;

-- Últimos movimientos de la auditoría
SELECT created_at, action, entity, entity_id FROM t_tienda_demo.audit_log ORDER BY created_at DESC LIMIT 20;

-- Intentos de inicio de sesión fallidos de hoy
SELECT occurred_at, email, ip, details FROM platform.security_events
WHERE event = 'LOGIN_FAILED' AND occurred_at > now() - interval '1 day' ORDER BY occurred_at DESC;
```

### Reglas para no dañar datos

- Úsala para **mirar**. Cambiar datos a mano se salta las reglas de la app (existencias, caja, consecutivos,
  auditoría) y puede dejar todo descuadrado. Si algo está mal, corrígelo desde la app (ajuste de inventario,
  anulación de venta…).
- Ventas, sus líneas y pagos, movimientos de caja e inventario, `audit_log` y `security_events` **no se pueden
  modificar ni borrar**: la base lo impide con triggers ("Los registros de … son inmutables").
- Nunca cambies el esquema a mano (crear/alterar tablas): eso lo hacen las migraciones de Flyway
  (`backend/src/main/resources/db`). Un cambio manual hace fallar el arranque (`ddl-auto: validate`).
- Para empezar de cero en desarrollo: `docker compose down -v` (borra la base) y `docker compose up --build`.

## 3. Backend

| Qué | Cómo |
|---|---|
| Logs en vivo | `docker compose logs -f backend` (cada línea trae `req=… tenant=… user=…`) |
| Solo errores | `docker compose logs backend \| Select-String "ERROR"` |
| Salud | `http://localhost:8080/actuator/health` → `{"status":"UP"}` |
| Swagger (todos los endpoints) | `http://localhost:8080/swagger-ui.html` con `OPENAPI_ENABLED=true` en `.env` (solo desarrollo) |
| Lo que hace la pantalla | Navegador → F12 → pestaña **Network**: cada llamada a `/api/...` con su respuesta |
| Pruebas | `cd backend; .\mvnw.cmd verify; cd ..` (necesita Docker Desktop encendido) |

**Probar endpoints en Swagger con sesión**: inicia sesión en la app, en F12 → Network abre la llamada `login`
(o `select-tenant` para endpoints de negocio), copia `accessToken` de la respuesta y pégalo en **Authorize**
(sin escribir "Bearer"). El token dura 15 minutos.

Errores frecuentes:

| Respuesta | Significado |
|---|---|
| 401 | Sin sesión o token vencido (la app lo renueva sola) |
| 403 | Sin permiso para esa acción, o el negocio está suspendido (`code: TENANT_UNAVAILABLE`) |
| 409 | Conflicto (código repetido, estado que no permite la acción, precio que cambió) |
| 422 | Regla de negocio (sin existencias, caja cerrada, confirmación incorrecta…) |
| 429 | Demasiadas solicitudes por minuto; esperar los segundos de `Retry-After` |

## 4. En producción

La base **no** tiene puerto abierto a internet. Se entra por SSH al servidor y desde ahí:

```bash
cd ~/sistema-facturacion-pos/deploy
docker compose exec postgres-db psql -U pos_admin -d pos_hibrido
docker compose logs -f backend
```

Para usar pgAdmin desde tu PC contra producción se usa un túnel SSH; se deja configurado al desplegar.
Swagger está apagado en producción y `/actuator` no es accesible desde internet (solo `/healthz`).
